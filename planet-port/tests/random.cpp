#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <cassert>
#include <cstdio>
using DWORD=uint32_t;
#include "../source/standard/inc/StdRandom.h"
int RandomCount=0;
unsigned int PlanetRandomState=1;
int main(){
  const int expected[]={41,18467,6334,26500,19169,15724,11478,29358,26962,24464};
  FixedRandom(1);for(int value:expected)assert(Random(32768)==value);
  assert(RandomCount==10);auto old=PlanetRandomState;assert(Random(0)==0);
  assert(PlanetRandomState==old&&RandomCount==11);
  FixedRandom(1);assert(Random(10)==1&&RandomCount==1);
  std::puts("Original MSVCRT sequence, range and zero-range semantics verified");
}
