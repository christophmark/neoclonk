// Adapter lifetime regression: metadata must retire with deleted GL handles.
#include "../source/standard/src/StdEmscriptenGL.cpp"
#include <cassert>
static int nativeDeleteCalls=0;
static GLsizei forwardedCount=0;
extern "C" void glDeleteTextures(GLsizei count,const GLuint *) {
  ++nativeDeleteCalls;forwardedCount=count;
}
int main() {
  GLuint textures[128];
  for(unsigned round=0;round<100;++round) {
    for(unsigned i=0;i<128;++i) {textures[i]=round*128+i+1;dimensions[textures[i]]=TextureSize(64,64);}
    assert(dimensions.size()==128);
    C4WebDeleteTextures(128,textures);
    assert(dimensions.empty());assert(forwardedCount==128);
  }
  assert(nativeDeleteCalls==100);
  std::puts("Texture metadata retired across 12800 distinct deleted handles");
}
