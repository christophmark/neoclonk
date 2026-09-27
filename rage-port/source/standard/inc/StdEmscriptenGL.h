// Browser platform adapter for Rage's desktop pixel layouts. Gameplay and
// authoritative surfaces retain their original BGRA / inverse-alpha encoding.
#ifndef INC_StdEmscriptenGL
#define INC_StdEmscriptenGL
#ifdef __EMSCRIPTEN__
#ifndef GL_GLEXT_PROTOTYPES
#define GL_GLEXT_PROTOTYPES 1
#endif
#include <GL/gl.h>
#include <GL/glext.h>
void C4WebTexImage2D(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const GLvoid *);
void C4WebTexSubImage2D(GLenum, GLint, GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, const GLvoid *);
void C4WebCopyTexImage2D(GLenum, GLint, GLenum, GLint, GLint, GLsizei, GLsizei, GLint);
void C4WebGetTexImage(GLenum, GLint, GLenum, GLenum, GLvoid *);
void C4WebReadPixels(GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, GLvoid *);
#ifndef STD_EMSCRIPTEN_GL_IMPLEMENTATION
#define glTexImage2D C4WebTexImage2D
#define glTexSubImage2D C4WebTexSubImage2D
#define glCopyTexImage2D C4WebCopyTexImage2D
#define glGetTexImage C4WebGetTexImage
#define glReadPixels C4WebReadPixels
#endif
#endif
#endif
