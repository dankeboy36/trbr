#include "module1.h"
#include <ESP32CrashUploader.h>

#define WIFI_SSID "<WIFI_SSID>"
#define WIFI_PASSWORD "<WIFI_PASSWORD>"

#define CRASH_DUMP_ENDPOINT "<CRASH_DUMP_ENDPOINT>"
#define BEARER_TOKEN "<BEARER_TOKEN>"

#define PROJECT "<PROJECT>"
#define VERSION "<VERSION>"
#define FQBN "<FQBN>"
// Optionally set a unique device, otherwise leave empty string to auto-generate
// from MAC
#define DEVICE_ID ""

static ESP32CrashUploader uploader(CRASH_DUMP_ENDPOINT, VERSION, PROJECT,
                                   DEVICE_ID, FQBN, BEARER_TOKEN);

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }

  uploader.begin(WIFI_SSID, WIFI_PASSWORD);

  for (int i = 5; i > 0; i--) {
    Serial.printf("Crashing in %d seconds...\n", i);
    delay(1000);
  }

  Serial.println("Triggering crash.");
  int value = 36;
  functionA(value);
}

void loop() {}