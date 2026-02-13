// Crash-loop scaffold for collecting realistic monitor recordings for Capturer.
//
// Usage:
// 1) Compile with debug symbols enabled (-Og -g3).
// 2) Flash and open monitor at 115200.
// 3) Record monitor output and copy relevant blocks into
//    src/lib/capturer/fixtures.js.

#include <Arduino.h>
#include <esp_system.h>

RTC_DATA_ATTR uint32_t boot_count = 0;

enum CrashMode : uint32_t {
  kLoadFaultPath = 0,
  kBadInstrPath = 1,
  kCrashModeCount = 2
};

CrashMode current_mode = kLoadFaultPath;
uint32_t trigger_delay_ms = 0;
bool crash_triggered = false;
uint32_t crash_trigger_at_ms = 0;
uint32_t last_status_ms = 0;

const char *mode_name(CrashMode mode) {
  switch (mode) {
  case kLoadFaultPath:
    return "load-fault-path";
  case kBadInstrPath:
    return "bad-instr-path";
  default:
    return "unknown";
  }
}

__attribute__((noinline)) void crash_load_leaf() {
  volatile uint32_t *p = (uint32_t *)0x4;
  volatile uint32_t value = *p;
  (void)value;
}

__attribute__((noinline)) void crash_load_mid() {
  Serial.println("[capturer-sketch] load mid");
  crash_load_leaf();
}

__attribute__((noinline)) void crash_load_entry() {
  Serial.println("[capturer-sketch] load entry");
  crash_load_mid();
}

__attribute__((noinline)) void crash_bad_instr_leaf() {
  using Func = void (*)();
  volatile uintptr_t bad_addr = 0x1;
  Func fn = reinterpret_cast<Func>(bad_addr);
  fn();
}

__attribute__((noinline)) void crash_bad_instr_mid() {
  Serial.println("[capturer-sketch] bad-instr mid");
  crash_bad_instr_leaf();
}

__attribute__((noinline)) void crash_bad_instr_entry() {
  Serial.println("[capturer-sketch] bad-instr entry");
  crash_bad_instr_mid();
}

CrashMode pick_mode_weighted_3_5() {
  // 3:5 distribution over two crash types.
  // 0..2 -> load (3/8)
  // 3..7 -> bad-instr (5/8)
  uint32_t bucket = esp_random() % 8u;
  if (bucket <= 2u) {
    return kLoadFaultPath;
  }
  return kBadInstrPath;
}

void setup() {
  Serial.begin(115200);
  uint32_t wait_started = millis();
  while (!Serial && (millis() - wait_started) < 4000u) {
    delay(10);
  }
  delay(250);

  boot_count++;
  current_mode = pick_mode_weighted_3_5();
  crash_triggered = false;
  last_status_ms = 0;

  switch (current_mode) {
  case kLoadFaultPath:
    trigger_delay_ms = 4000;
    break;
  case kBadInstrPath:
    trigger_delay_ms = 5000;
    break;
  default:
    trigger_delay_ms = 4000;
    break;
  }
  crash_trigger_at_ms = millis() + trigger_delay_ms;

  Serial.printf("[capturer-sketch] boot=%u mode=%s delayMs=%u\n",
                (unsigned)boot_count, mode_name(current_mode),
                (unsigned)trigger_delay_ms);
  Serial.println("[capturer-sketch] setup complete, waiting before crash");
  Serial.flush();
}

void loop() {
  if (crash_triggered) {
    delay(1000);
    return;
  }

  uint32_t now = millis();
  if (now < crash_trigger_at_ms) {
    if ((now - last_status_ms) >= 500u) {
      last_status_ms = now;
      uint32_t remaining = crash_trigger_at_ms - now;
      Serial.printf("[capturer-sketch] mode=%s remainingMs=%u\n",
                    mode_name(current_mode), (unsigned)remaining);
    }
    delay(10);
    return;
  }

  crash_triggered = true;
  Serial.printf("[capturer-sketch] triggering %s\n", mode_name(current_mode));
  Serial.flush();
  delay(50);

  switch (current_mode) {
  case kLoadFaultPath:
    crash_load_entry();
    break;
  case kBadInstrPath:
    crash_bad_instr_entry();
    break;
  default:
    crash_load_entry();
    break;
  }
}
