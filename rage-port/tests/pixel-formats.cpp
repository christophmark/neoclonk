// Verify browser pixel transfers preserve Rage's packed color and alpha bits.
// The production adapter is included so its pure conversion routines can be
// exercised without an actual GL context.
#include "../source/standard/src/StdEmscriptenGL.cpp"
#include <cassert>
int main() {
  const uint32_t colors[]={0x00010203u,0xff123456u,0x807faf10u,0xffffffffu};
  std::vector<unsigned char> rgba=ToRGBA(colors,4,GL_BGRA,GL_UNSIGNED_INT_8_8_8_8_REV);
  assert(rgba[0]==1&&rgba[1]==2&&rgba[2]==3&&rgba[3]==0);
  assert(rgba[4]==0x12&&rgba[5]==0x34&&rgba[6]==0x56&&rgba[7]==0xff);
  uint32_t returned[4]={};FromRGBA(rgba,returned,GL_BGRA,GL_UNSIGNED_INT_8_8_8_8_REV);
  assert(!std::memcmp(colors,returned,sizeof(colors)));
  const uint16_t colors16[]={0x0123,0xabcd,0xffff,0x8000};
  rgba=ToRGBA(colors16,4,GL_BGRA,GL_UNSIGNED_SHORT_4_4_4_4_REV);
  uint16_t returned16[4]={};FromRGBA(rgba,returned16,GL_BGRA,GL_UNSIGNED_SHORT_4_4_4_4_REV);
  assert(!std::memcmp(colors16,returned16,sizeof(colors16)));
  const unsigned char bgr[]={3,2,1,9,8,7};
  rgba=ToRGBA(bgr,2,GL_BGR,GL_UNSIGNED_BYTE);
  assert(rgba[0]==1&&rgba[1]==2&&rgba[2]==3&&rgba[3]==255);
  unsigned char bgrReturned[6]={};FromRGBA(rgba,bgrReturned,GL_BGR,GL_UNSIGNED_BYTE);
  assert(!std::memcmp(bgr,bgrReturned,sizeof(bgr)));
  std::puts("Original Rage 32bit/16bit/24bit pixel round-trips passed");
}
