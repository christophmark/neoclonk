#ifndef INC_C4BrowserNetwork
#define INC_C4BrowserNetwork
class C4Control;
class C4ControlPacket;
bool BrowserNetworkEnabled();
bool BrowserNetworkReady();
void BrowserNetworkSeed();
void BrowserNetworkTake(C4Control &control);
void BrowserNetworkAfterControl();
bool BrowserNetworkQueue(int type, C4ControlPacket *packet);
bool BrowserNetworkDecodeAllowed(int type);
#endif
