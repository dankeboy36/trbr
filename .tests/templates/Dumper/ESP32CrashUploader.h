#pragma once

#include <Arduino.h>

class ESP32CrashUploader {
public:
  ESP32CrashUploader(const char *serverUrl, const char *firmwareVersion,
                     const char *project, const char *deviceId,
                     const char *fqbn, const char *authToken);
  void begin(const char *wifiSsid, const char *wifiPassword);
  void tryUpload();

private:
  const char *_serverUrl;
  const char *_firmwareVersion;
  const char *_project;
  const char *_deviceId;
  const char *_fqbn;
  const char *_authToken;

  void *alloc(size_t size);
  void eraseCoreDump();
};
