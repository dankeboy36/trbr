class Person {
public:
  Person() {
    Serial.printf("New person\n");
  }
  void hello(const char *msg) {
    Serial.printf("%s\n", msg);
  }
};

Person *p = NULL;
Person *p2 = NULL;
int *p3 = NULL;

void setup() {
  Serial.begin(115200);
  Serial.printf("Test exception, p = 0x%X | p2 = 0x%X\n", p, p2);
  p->hello("Hello, World 1!");   // not cause exception, WHY?
  p2->hello("Hello, World 2!");  // not cause exception, WHY?
  *p3 = 10;                      // Cause exception here
}

void loop() {
  delay(2000);
}
