// Minimal pixel-transfer adapter for the original Clonk Rage OpenGL backend.
// The SDL/Emscripten compatibility layer translates the original draw calls;
// this file handles the desktop BGRA formats absent from WebGL.
#ifdef __EMSCRIPTEN__
#define STD_EMSCRIPTEN_GL_IMPLEMENTATION
#include <StdEmscriptenGL.h>
#include <vector>
#include <map>
#include <stdint.h>
#include <cstring>
#include <cstdio>

namespace {
struct TextureSize { GLsizei width, height; TextureSize():width(0),height(0){} TextureSize(GLsizei w,GLsizei h):width(w),height(h){} };
std::map<GLuint, TextureSize> dimensions;
GLuint BoundTexture() { GLint name=0; glGetIntegerv(GL_TEXTURE_BINDING_2D,&name); return name; }
bool NeedsConversion(GLenum format, GLenum type) { return format==GL_BGRA || format==GL_BGR || type==GL_UNSIGNED_SHORT_4_4_4_4_REV || type==GL_UNSIGNED_INT_8_8_8_8_REV; }
std::vector<unsigned char> ToRGBA(const void *data,size_t count,GLenum format,GLenum type) {
  std::vector<unsigned char> result(count*4,0);
  if(!data)return result;
  const unsigned char *bytes=static_cast<const unsigned char*>(data);
  for(size_t i=0;i<count;++i) {
    if(type==GL_UNSIGNED_SHORT_4_4_4_4_REV) {
      uint16_t value;std::memcpy(&value,bytes+i*2,2);
      result[i*4]=(value>>8&15)*17;result[i*4+1]=(value>>4&15)*17;
      result[i*4+2]=(value&15)*17;result[i*4+3]=(value>>12&15)*17;
    } else {
      const size_t stride=format==GL_BGR?3:4;
      result[i*4]=bytes[i*stride+2];result[i*4+1]=bytes[i*stride+1];
      result[i*4+2]=bytes[i*stride];result[i*4+3]=stride==4?bytes[i*stride+3]:255;
    }
  }
  return result;
}
void FromRGBA(const std::vector<unsigned char>& rgba,void *data,GLenum format,GLenum type) {
  unsigned char *bytes=static_cast<unsigned char*>(data);
  const size_t count=rgba.size()/4;
  for(size_t i=0;i<count;++i) {
    if(type==GL_UNSIGNED_SHORT_4_4_4_4_REV) {
      uint16_t value=(rgba[i*4+3]>>4)<<12|(rgba[i*4]>>4)<<8|(rgba[i*4+1]>>4)<<4|(rgba[i*4+2]>>4);
      std::memcpy(bytes+i*2,&value,2);
    } else {
      const size_t stride=format==GL_BGR||format==GL_RGB?3:4;
      const bool reverse=format==GL_BGR||format==GL_BGRA;
      bytes[i*stride]=rgba[i*4+(reverse?2:0)];bytes[i*stride+1]=rgba[i*4+1];
      bytes[i*stride+2]=rgba[i*4+(reverse?0:2)];if(stride==4)bytes[i*stride+3]=rgba[i*4+3];
    }
  }
}
}
void C4WebTexImage2D(GLenum target,GLint level,GLint internal,GLsizei width,GLsizei height,GLint border,GLenum format,GLenum type,const GLvoid *pixels) {
  if(!level)dimensions[BoundTexture()]=TextureSize(width,height);
  if(NeedsConversion(format,type)) {
    std::vector<unsigned char> rgba=ToRGBA(pixels,size_t(width)*height,format,type);
    glTexImage2D(target,level,GL_RGBA,width,height,border,GL_RGBA,GL_UNSIGNED_BYTE,pixels?&rgba[0]:0);
  } else glTexImage2D(target,level,internal==4?GL_RGBA:internal==3?GL_RGB:internal,width,height,border,format,type,pixels);
}
void C4WebTexSubImage2D(GLenum target,GLint level,GLint x,GLint y,GLsizei width,GLsizei height,GLenum format,GLenum type,const GLvoid *pixels) {
  if(NeedsConversion(format,type)) {
    std::vector<unsigned char> rgba=ToRGBA(pixels,size_t(width)*height,format,type);
    glTexSubImage2D(target,level,x,y,width,height,GL_RGBA,GL_UNSIGNED_BYTE,&rgba[0]);
  } else glTexSubImage2D(target,level,x,y,width,height,format,type,pixels);
}
void C4WebCopyTexImage2D(GLenum target,GLint level,GLenum internal,GLint x,GLint y,GLsizei width,GLsizei height,GLint border) {
  if(!level)dimensions[BoundTexture()]=TextureSize(width,height);
  glCopyTexImage2D(target,level,internal==GL_RGBA8?GL_RGBA:internal,x,y,width,height,border);
}
void C4WebReadPixels(GLint x,GLint y,GLsizei width,GLsizei height,GLenum format,GLenum type,GLvoid *pixels) {
  if(width<=0||height<=0||!pixels)return;
  std::vector<unsigned char> rgba(size_t(width)*height*4);
  glReadPixels(x,y,width,height,GL_RGBA,GL_UNSIGNED_BYTE,&rgba[0]);
  FromRGBA(rgba,pixels,format,type);
}
void C4WebGetTexImage(GLenum target,GLint level,GLenum format,GLenum type,GLvoid *pixels) {
  const GLuint texture=BoundTexture();const TextureSize size=dimensions[texture];
  if(size.width<=0||size.height<=0){std::fprintf(stderr,"Unknown Rage texture size: %u\n",texture);return;}
  GLint previous=0;glGetIntegerv(GL_FRAMEBUFFER_BINDING,&previous);
  GLuint framebuffer=0;glGenFramebuffers(1,&framebuffer);glBindFramebuffer(GL_FRAMEBUFFER,framebuffer);
  glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,target,texture,level);
  C4WebReadPixels(0,0,size.width,size.height,format,type,pixels);
  glBindFramebuffer(GL_FRAMEBUFFER,previous);glDeleteFramebuffers(1,&framebuffer);
}
#endif
