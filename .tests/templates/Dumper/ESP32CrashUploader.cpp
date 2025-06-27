#include "ESP32CrashUploader.h"
#include "esp_mac.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <esp_core_dump.h>
#include <esp_partition.h>

ESP32CrashUploader::ESP32CrashUploader(const char *serverUrl,
                                       const char *firmwareVersion,
                                       const char *project,
                                       const char *deviceId, const char *fqbn,
                                       const char *authToken)
    : _serverUrl(serverUrl), _firmwareVersion(firmwareVersion),
      _project(project), _deviceId(deviceId), _fqbn(fqbn),
      _authToken(authToken) {}

void ESP32CrashUploader::begin(const char *wifiSsid, const char *wifiPassword) {
  if (_deviceId == nullptr || _deviceId[0] == '\0') {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    static char macStr[13];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1],
             mac[2], mac[3], mac[4], mac[5]);
    _deviceId = macStr;
    Serial.printf("ESP32CrashUploader: Generated device_id from MAC: %s\n",
                  _deviceId);
  }

  Serial.printf("ESP32CrashUploader: Connecting to WiFi SSID: %s\n", wifiSsid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPassword);
  int retryCount = 0;
  while (WiFi.status() != WL_CONNECTED && retryCount < 20) {
    delay(500);
    Serial.print(".");
    retryCount++;
  }
  Serial.println();
  Serial.printf("WiFi.status() = %d\n", WiFi.status());
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("ESP32CrashUploader: WiFi connected.");
    Serial.print("ESP32CrashUploader: IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("ESP32CrashUploader: Failed to connect to WiFi.");
  }

  tryUpload();
}

void *ESP32CrashUploader::alloc(size_t size) { return ps_malloc(size); }

void ESP32CrashUploader::tryUpload() {
  esp_reset_reason_t reason = esp_reset_reason();
  Serial.printf("ESP32CrashUploader: Reset reason is %d\n", reason);
  if (reason == ESP_RST_SW || reason == ESP_RST_POWERON) {
    Serial.println("ESP32CrashUploader: No crash detected, skipping upload.");
    Serial.printf("ESP32CrashUploader: Reset reason was %d\n", reason);
    Serial.println("ESP32CrashUploader: Upload skipped.");
    return;
  }

  Serial.println("ESP32CrashUploader: Checking for core dump...");
  Serial.print("ESP32CrashUploader: MAC (device_id): ");
  Serial.println(_deviceId);
  size_t addr = 0;
  size_t size = 0;
  if (esp_core_dump_image_get(&addr, &size) != ESP_OK) {
    Serial.println("ESP32CrashUploader: esp_core_dump_image_get() failed.");
    Serial.println("ESP32CrashUploader: No core dump found.");
    return;
  }
  Serial.printf("ESP32CrashUploader: esp_core_dump_image_get() returned "
                "address: 0x%08X, size: %u\n",
                (unsigned int)addr, (unsigned int)size);

  const esp_partition_t *partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, "coredump");
  if (!partition) {
    Serial.println(
        "ESP32CrashUploader: esp_partition_find_first() returned NULL.");
    Serial.println("ESP32CrashUploader: Could not find coredump partition.");
    return;
  }
  Serial.printf("ESP32CrashUploader: Found coredump partition at address: "
                "0x%08X, size: %u\n",
                (unsigned int)partition->address,
                (unsigned int)partition->size);
  Serial.printf("Partition size: %u\n", (unsigned int)partition->size);
  Serial.printf("Dump size from image_get(): %u\n", (unsigned int)size);

  Serial.printf("ESP32CrashUploader: Attempting to allocate %u bytes\n",
                (unsigned int)size);
  Serial.printf("ESP32CrashUploader: Free heap before alloc: %u\n",
                (unsigned int)esp_get_free_heap_size());
  Serial.printf("ESP32CrashUploader: Free PSRAM before alloc: %u\n",
                (unsigned int)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));

  uint8_t *buffer = (uint8_t *)ps_malloc(size);
  if (!buffer) {
    Serial.println(
        "ESP32CrashUploader: ps_malloc() failed. Trying heap_caps_malloc...");
    buffer = (uint8_t *)heap_caps_malloc(size, MALLOC_CAP_8BIT);
    if (!buffer) {
      Serial.println(
          "ESP32CrashUploader: heap_caps_malloc() also failed. Aborting.");
      return;
    } else {
      Serial.println("ESP32CrashUploader: heap_caps_malloc() succeeded.");
    }
  } else {
    Serial.println("ESP32CrashUploader: ps_malloc() succeeded.");
  }

  if (esp_partition_read(partition, 0, buffer, size) != ESP_OK) {
    Serial.println("ESP32CrashUploader: esp_partition_read() failed.");
    free(buffer);
    return;
  }
  Serial.printf("ESP32CrashUploader: Read core dump of size %d bytes\n", size);
  Serial.println("ESP32CrashUploader: First 64 bytes of coredump partition:");
  for (size_t i = 0; i < 64 && i < size; ++i) {
    Serial.printf("%02X ", buffer[i]);
    if ((i + 1) % 16 == 0)
      Serial.println();
  }
  Serial.println();
  Serial.println(
      "ESP32CrashUploader: Dump read complete, validating contents...");
  for (size_t i = 0; i < 16 && i < size; ++i) {
    Serial.printf("Byte %02d: 0x%02X\n", (int)i, buffer[i]);
  }

  Serial.println("ESP32CrashUploader: Preparing multipart form data...");
  Serial.print("ESP32CrashUploader: Server URL: ");
  Serial.println(_serverUrl);
  Serial.print("ESP32CrashUploader: Firmware version: ");
  Serial.println(_firmwareVersion);
  Serial.print("ESP32CrashUploader: Project: ");
  Serial.println(_project);
  Serial.print("ESP32CrashUploader: Device ID: ");
  Serial.println(_deviceId);
  Serial.print("ESP32CrashUploader: FQBN: ");
  Serial.println(_fqbn);

  WiFiClient client;
  client.setTimeout(10000); // 10 seconds timeout

  String boundary = "----ESPBOUNDARY";
  String bodyStart =
      "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\"version\"\r\n\r\n" +
      _firmwareVersion + "\r\n" + "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\"project\"\r\n\r\n" + _project +
      "\r\n" + "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n" + _deviceId +
      "\r\n" + "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\"fqbn\"\r\n\r\n" + _fqbn + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\"coredump\"; "
      "filename=\"coredump.bin\"\r\n" +
      "Content-Type: application/octet-stream\r\n\r\n";
  String bodyEnd = "\r\n--" + boundary + "--\r\n";
  int contentLength = bodyStart.length() + size + bodyEnd.length();

  Serial.printf("ESP32CrashUploader: Total expected content length: %d\n",
                contentLength);
  Serial.printf(
      "ESP32CrashUploader: Body start (headers + metadata) size: %d\n",
      bodyStart.length());
  Serial.printf("ESP32CrashUploader: Body end (boundary) size: %d\n",
                bodyEnd.length());

  // Parse host and path from _serverUrl
  String url(_serverUrl);
  String protocol = url.startsWith("https://") ? "https" : "http";
  url.replace("https://", "");
  url.replace("http://", "");
  int slashIndex = url.indexOf('/');
  String host = url.substring(0, slashIndex);
  String path = url.substring(slashIndex);
  String connectionString = protocol + "://" + host + path;

  Serial.print("ESP32CrashUploader: Attempting to connect to ");
  Serial.println(connectionString);

  Serial.print("ESP32CrashUploader: Host string: ");
  Serial.println(host);

  // Extract hostname and port
  int colonIndex = host.indexOf(':');
  String hostname = host;
  uint16_t port = 80;
  if (colonIndex != -1) {
    hostname = host.substring(0, colonIndex);
    port = host.substring(colonIndex + 1).toInt();
  }

  Serial.print("ESP32CrashUploader: Hostname: ");
  Serial.println(hostname);
  Serial.print("ESP32CrashUploader: Port: ");
  Serial.println(port);

  IPAddress ip;
  if (!WiFi.hostByName(hostname.c_str(), ip)) {
    Serial.println("ESP32CrashUploader: DNS resolution failed!");
    free(buffer);
    return;
  }

  Serial.print("ESP32CrashUploader: Resolved IP: ");
  Serial.println(ip);

  if (!client.connect(ip, port)) {
    Serial.print("ESP32CrashUploader: Failed to connect to server at ");
    Serial.println(connectionString);
    free(buffer);
    return;
  }
  if (!client.connected()) {
    Serial.println("ESP32CrashUploader: client.connected() returned false "
                   "after connect()");
  } else {
    Serial.println(
        "ESP32CrashUploader: client.connected() returned true after connect()");
  }

  client.print("POST " + path + " HTTP/1.1\r\n");
  client.print("Host: " + host + "\r\n");
  client.print("Content-Type: multipart/form-data; boundary=" + boundary +
               "\r\n");
  client.print("Content-Length: " + String(contentLength) + "\r\n");
  if (_authToken) {
    client.print("Authorization: Bearer ");
    client.print(_authToken);
    client.print("\r\n");
  }
  client.print("Connection: close\r\n\r\n");

  client.print(bodyStart);
  size_t bytesSent = client.write(buffer, size);
  Serial.printf("ESP32CrashUploader: Sent %u of %u bytes of coredump payload\n",
                (unsigned int)bytesSent, (unsigned int)size);
  client.print(bodyEnd);

  Serial.printf("ESP32CrashUploader: bodyStart length: %d\n",
                bodyStart.length());
  Serial.printf("ESP32CrashUploader: bodyEnd length: %d\n", bodyEnd.length());

  Serial.println("ESP32CrashUploader: Multipart POST request sent.");

  Serial.printf("ESP32CrashUploader: Content-Length: %d\n", contentLength);
  Serial.print("ESP32CrashUploader: Boundary used: ");
  Serial.println(boundary);

  Serial.println("ESP32CrashUploader: Reading response headers...");
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    Serial.println(line);
    if (line == "\r")
      break;
  }
  String response = client.readString();
  Serial.println("ESP32CrashUploader: Server response:");
  Serial.println(response);
  if (response.length() == 0) {
    Serial.println("ESP32CrashUploader: Warning: Empty response from server.");
  }

  client.stop();
  if (!client.connected()) {
    Serial.println("ESP32CrashUploader: Connection closed by server.");
  } else {
    Serial.println("ESP32CrashUploader: Connection still open after sending.");
  }
  free(buffer);
  // eraseCoreDump(); // Disabled for debugging purposes
}

void ESP32CrashUploader::eraseCoreDump() {
  Serial.println("ESP32CrashUploader: Erasing core dump partition...");
  const esp_partition_t *part = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, "coredump");
  if (!part || part->size < sizeof(uint32_t))
    return;

  esp_partition_erase_range(part, 0, part->size);

  const uint32_t invalid_size = 0xFFFFFFFF;
  esp_partition_write(part, 0, &invalid_size, sizeof(invalid_size));
}