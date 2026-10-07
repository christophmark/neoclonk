#include <C4Include.h>
#include <GLES3/gl3.h>
#include <GLFW/glfw3.h>
#include <vector>
#include <iostream>
#include <fstream>
#include <string.h>
#include <thread>
#include <algorithm>
#include <math.h>

struct CGLSurface {
  int w, h, pitch;
  uint8_t *bits;
  GLuint tex;
  GLuint fbo;
  bool dirty_cpu;
  bool dirty_gpu;
  uint8_t ColorKey;
  bool useColorKey;
  int ClipX1, ClipY1, ClipX2, ClipY2;
  bool fClipped;
};

// Global instance
CStdDDraw *lpDDraw = NULL;
static GLFWwindow *g_window = NULL;
static GLuint g_paletteTex = 0;
static GLuint g_shaderProgramScreen = 0;
static GLuint g_shaderProgramBlit = 0;
static GLuint g_shaderProgramSolid = 0;
static GLuint g_vao = 0, g_vbo = 0;
extern std::thread::id g_mainThreadId;

extern "C" void *GetGLFWWindow() { return (void *)g_window; }

static void DebugLog(const char *msg) {
  std::ofstream out("/tmp/clonk_debug.log", std::ios::app);
  out << "[Thread " << std::this_thread::get_id() << "] " << msg << std::endl;
}

static void glfwErrorCallback(int error, const char *description) {
  char buf[1024];
  sprintf(buf, "GLFW Error (%d): %s", error, description);
  DebugLog(buf);
  std::cerr << buf << std::endl;
}

static void glfwWindowSizeCallback(GLFWwindow *window, int width, int height) {
  // Not used yet, engine uses fixed ResX/ResY
}

static const char *vertexShaderSrc = R"(#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aTexCoord;
out vec2 TexCoord;
uniform mat4 projection;
void main() {
    gl_Position = projection * vec4(aPos, 0.0, 1.0);
    TexCoord = aTexCoord;
}
)";

static const char *fragmentShaderScreenSrc = R"(#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
out vec4 FragColor;
in vec2 TexCoord;
uniform usampler2D texImage;
uniform sampler2D texPalette;
uniform uint colKey;
uniform bool useColKey;
void main() {
    ivec2 size = textureSize(texImage, 0);
    ivec2 itexCoord = clamp(ivec2(TexCoord * vec2(size)), ivec2(0), size - ivec2(1));
    uint idx = texelFetch(texImage, itexCoord, 0).r;
    if (useColKey && idx == colKey) discard;
    FragColor = texelFetch(texPalette, ivec2(int(idx), 0), 0);
}
)";

static const char *fragmentShaderBlitSrc = R"(#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) out uint Index;
in vec2 TexCoord;
uniform usampler2D texImage;
uniform uint colKey;
uniform bool useColKey;
void main() {
    ivec2 size = textureSize(texImage, 0);
    ivec2 itexCoord = clamp(ivec2(TexCoord * vec2(size)), ivec2(0), size - ivec2(1));
    uint idx = texelFetch(texImage, itexCoord, 0).r;
    if (useColKey && idx == colKey) discard;
    Index = idx;
}
)";

static const char *fragmentShaderSolidSrc = R"(#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) out uint Index;
uniform uint color;
void main() {
    Index = color;
}
)";

static GLuint CompileShader(GLenum type, const char *source) {
  GLuint shader = glCreateShader(type);
  glShaderSource(shader, 1, &source, NULL);
  glCompileShader(shader);
  int success;
  glGetShaderiv(shader, GL_COMPILE_STATUS, &success);
  if (!success) {
    char infoLog[512];
    glGetShaderInfoLog(shader, 512, NULL, infoLog);
    DebugLog("Shader Compile Error");
    DebugLog(infoLog);
    fprintf(stderr,"Planet shader compilation failed: %s\n",infoLog);
    glDeleteShader(shader);
    return 0;
  }
  return shader;
}

static GLuint CreateProgram(const char *vsSrc, const char *fsSrc) {
  GLuint vs = CompileShader(GL_VERTEX_SHADER, vsSrc);
  GLuint fs = CompileShader(GL_FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) { if(vs)glDeleteShader(vs);if(fs)glDeleteShader(fs);return 0; }
  GLuint program = glCreateProgram();
  glAttachShader(program, vs);
  glAttachShader(program, fs);
  glLinkProgram(program);
  int success;
  glGetProgramiv(program, GL_LINK_STATUS, &success);
  if (!success) {
    char infoLog[512];
    glGetProgramInfoLog(program, 512, NULL, infoLog);
    DebugLog("Program Link Error");
    DebugLog(infoLog);
    fprintf(stderr,"Planet shader linking failed: %s\n",infoLog);
    glDeleteProgram(program);program=0;
  }
  glDeleteShader(vs);
  glDeleteShader(fs);
  return program;
}

static void GetOrthoMatrix(float *mat, float left, float right, float bottom, float top) {
  memset(mat, 0, 16 * sizeof(float));
  if (right - left == 0.0f || top - bottom == 0.0f) {
    mat[0] = 1.0f;
    mat[5] = 1.0f;
    mat[10] = 1.0f;
    mat[15] = 1.0f;
    return;
  }
  mat[0] = 2.0f / (right - left);
  mat[5] = 2.0f / (top - bottom);
  mat[10] = -1.0f;
  mat[12] = -(right + left) / (right - left);
  mat[13] = -(top + bottom) / (top - bottom);
  mat[15] = 1.0f;
}

static void SyncSurfaceGPU(CGLSurface *surf) {
  if (!surf || !g_window || std::this_thread::get_id() != g_mainThreadId) return;
  // All drawing into surfaces happens in CPU memory. Allocate GPU storage only
  // for a surface actually presented on screen, not every sprite/landscape.
  if (!surf->tex) {
    GLint maxTextureSize = 0;
    glGetIntegerv(GL_MAX_TEXTURE_SIZE, &maxTextureSize);
    if (surf->w > maxTextureSize || surf->h > maxTextureSize) return;
    glGenTextures(1, &surf->tex);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glBindTexture(GL_TEXTURE_2D, surf->tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R8UI, surf->w, surf->h, 0, GL_RED_INTEGER, GL_UNSIGNED_BYTE, surf->bits);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glBindTexture(GL_TEXTURE_2D, 0);
    surf->dirty_cpu = false;
  } else if (surf->dirty_cpu) {
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glBindTexture(GL_TEXTURE_2D, surf->tex);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, surf->w, surf->h, GL_RED_INTEGER, GL_UNSIGNED_BYTE, surf->bits);
    glBindTexture(GL_TEXTURE_2D, 0);
    surf->dirty_cpu = false;
  }
}

static void SyncSurfaceCPU(CGLSurface *surf) {
  if (surf && surf->dirty_gpu && surf->fbo && std::this_thread::get_id() == g_mainThreadId) {
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, surf->fbo);
    glReadPixels(0, 0, surf->w, surf->h, GL_RED_INTEGER, GL_UNSIGNED_BYTE, surf->bits);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
    surf->dirty_gpu = false;
  }
}

static void DrawHardwareQuad(CGLSurface *src, CGLSurface *dst, int tx, int ty, int twdt, int thgt, int sx = 0, int sy = 0, int swdt = -1, int shgt = -1, bool useScissor = true, float angle = 0.0f,
                            bool fSrcColKey = true, GLuint program = 0, uint32_t color = 0) {
  // Indexed surfaces stay authoritative on the CPU, matching original software
  // drawing. Only the final palette presentation uploads pixels to WebGL.
  // This also supports sprite strips beyond the GPU texture limit.
  if (dst) {
    if(twdt<=0||thgt<=0)return;
    SyncSurfaceCPU(src);SyncSurfaceCPU(dst);
    if(src){if(swdt<0)swdt=src->w;if(shgt<0)shgt=src->h;}
    double rad=-angle*3.141592653589793/180.0,c=cos(rad),sn=sin(rad);
    double mx=tx+twdt/2.0,my=ty+thgt/2.0;
    int ex=int(ceil((fabs(c)*twdt+fabs(sn)*thgt)/2.0)),ey=int(ceil((fabs(sn)*twdt+fabs(c)*thgt)/2.0));
    int x0=Max(0,int(floor(mx-ex))),x1=Min(dst->w,int(ceil(mx+ex))),y0=Max(0,int(floor(my-ey))),y1=Min(dst->h,int(ceil(my+ey)));
    if(angle==0.0f){x0=Max(0,tx);x1=Min(dst->w,tx+twdt);y0=Max(0,ty);y1=Min(dst->h,ty+thgt);}
    if(useScissor&&lpDDraw){x0=Max(x0,lpDDraw->ClipX1);x1=Min(x1,lpDDraw->ClipX2+1);y0=Max(y0,lpDDraw->ClipY1);y1=Min(y1,lpDDraw->ClipY2+1);}
    // Most terrain and sprite draws are unrotated 1:1 copies.
    if(angle==0.0f && (!src || (swdt==twdt && shgt==thgt))) {
      bool key=src&&fSrcColKey&&src->useColorKey;
      for(int y=y0;y<y1;++y){
        unsigned char*row=dst->bits+y*dst->pitch;
        if(!src){if(x1>x0)memset(row+x0,(unsigned char)color,x1-x0);continue;}
        int yy=BoundBy(sy+y-ty,0,src->h-1),xx=sx+x0-tx;
        const unsigned char*from=src->bits+yy*src->pitch;
        if(!key&&xx>=0&&xx+x1-x0<=src->w){if(x1>x0)memmove(row+x0,from+xx,x1-x0);}
        else for(int x=x0;x<x1;++x){unsigned char index=from[BoundBy(sx+x-tx,0,src->w-1)];if(!key||index!=src->ColorKey)row[x]=index;}
      }
      dst->dirty_cpu=true;return;
    }
    for(int y=y0;y<y1;++y)for(int x=x0;x<x1;++x){
      double dx=x+0.5-mx,dy=y+0.5-my,u=(dx*c+dy*sn+twdt/2.0)/twdt,v=(-dx*sn+dy*c+thgt/2.0)/thgt;
      if(u<0||u>=1||v<0||v>=1)continue;
      unsigned char index=color;
      if(src){int xx=BoundBy(int(floor(sx+u*swdt)),0,src->w-1),yy=BoundBy(int(floor(sy+v*shgt)),0,src->h-1);index=src->bits[yy*src->pitch+xx];if(fSrcColKey&&src->useColorKey&&index==src->ColorKey)continue;}
      dst->bits[y*dst->pitch+x]=index;
    }
    dst->dirty_cpu=true;return;
  }
  SyncSurfaceGPU(src);
  if ((!src || !src->tex) && program != g_shaderProgramSolid)
    return;
  if (twdt <= 0 || thgt <= 0) return;
  if (src) {
    if (swdt == -1)
      swdt = src->w;
    if (shgt == -1)
      shgt = src->h;
    SyncSurfaceGPU(src);
  }

  if (dst) {
    SyncSurfaceGPU(dst);
    glBindFramebuffer(GL_FRAMEBUFFER, dst->fbo);
    glViewport(0, 0, dst->w, dst->h);
    dst->dirty_gpu = true;
  } else {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    int w, h;
    glfwGetFramebufferSize(g_window, &w, &h);
    glViewport(0, 0, w, h);
  }

  if (useScissor && lpDDraw) {
    int scX, scY, scW, scH;
    if (dst && dst->fClipped) {
      scX = std::max(0, lpDDraw->ClipX1); // Primary clipper
      scY = std::max(0, lpDDraw->ClipY1);
      scW = std::max(0, lpDDraw->ClipX2 - lpDDraw->ClipX1 + 1);
      scH = std::max(0, lpDDraw->ClipY2 - lpDDraw->ClipY1 + 1);
    } else {
      scX = std::max(0, lpDDraw->ClipX1);
      scY = std::max(0, lpDDraw->ClipY1);
      scW = std::max(0, lpDDraw->ClipX2 - lpDDraw->ClipX1 + 1);
      scH = std::max(0, lpDDraw->ClipY2 - lpDDraw->ClipY1 + 1);
    }

    glEnable(GL_SCISSOR_TEST);
    if (dst) {
      glScissor(scX, scY, scW, scH);
    } else {
      int w, h;
      glfwGetFramebufferSize(g_window, &w, &h);
      glScissor(scX, h - scY - scH, scW, scH);
    }
  } else {
    glDisable(GL_SCISSOR_TEST);
  }

  if (program == 0)
    program = g_shaderProgramScreen;
  glUseProgram(program);

  float projection[16];
  if (dst) {
    GetOrthoMatrix(projection, 0.0f, (float)dst->w, 0.0f, (float)dst->h);
  } else {
    int w, h;
    glfwGetFramebufferSize(g_window, &w, &h);
    GetOrthoMatrix(projection, 0.0f, (float)w, (float)h, 0.0f);
  }
  glUniformMatrix4fv(glGetUniformLocation(program, "projection"), 1, GL_FALSE, projection);

  if (src) {
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, src->tex);
    glUniform1i(glGetUniformLocation(program, "texImage"), 0);
    bool activeColKey = src->useColorKey && fSrcColKey;
    if (program == g_shaderProgramScreen) {
      glActiveTexture(GL_TEXTURE1);
      glBindTexture(GL_TEXTURE_2D, g_paletteTex);
      glUniform1i(glGetUniformLocation(program, "texPalette"), 1);
      glUniform1ui(glGetUniformLocation(program, "colKey"), (uint32_t)src->ColorKey);
      glUniform1i(glGetUniformLocation(program, "useColKey"), activeColKey ? 1 : 0);
    } else if (program == g_shaderProgramBlit) {
      glUniform1ui(glGetUniformLocation(program, "colKey"), (uint32_t)src->ColorKey);
      glUniform1i(glGetUniformLocation(program, "useColKey"), activeColKey ? 1 : 0);
    }
  }

  if (program == g_shaderProgramSolid) {
    glUniform1ui(glGetUniformLocation(program, "color"), color);
  }

  float u1 = src ? (float)sx / src->w : 0.0f;
  float v1 = src ? (float)sy / src->h : 0.0f;
  float u2 = src ? (float)(sx + swdt) / src->w : 1.0f;
  float v2 = src ? (float)(sy + shgt) / src->h : 1.0f;

  float midX = tx + twdt / 2.0f;
  float midY = ty + thgt / 2.0f;
  float angle_rad;
  if (!dst) {
    angle_rad = angle * 3.14159265f / 180.0f;
  } else {
    angle_rad = -angle * 3.14159265f / 180.0f;
  }
  float s = sin(angle_rad);
  float c = cos(angle_rad);

  auto rotate = [&](float x, float y, float &rx, float &ry) {
    float dx = x - midX;
    float dy = y - midY;
    rx = midX + dx * c - dy * s;
    ry = midY + dx * s + dy * c;
  };

  float rx0, ry0, rx1, ry1, rx2, ry2, rx3, ry3;
  rotate((float)tx, (float)ty, rx0, ry0);
  rotate((float)tx + twdt, (float)ty, rx1, ry1);
  rotate((float)tx + twdt, (float)ty + thgt, rx2, ry2);
  rotate((float)tx, (float)ty + thgt, rx3, ry3);

  float vertices[] = {rx0, ry0, u1, v1, rx1, ry1, u2, v1, rx2, ry2, u2, v2, rx2, ry2, u2, v2, rx3, ry3, u1, v2, rx0, ry0, u1, v1};

  glBindVertexArray(g_vao);
  glBindBuffer(GL_ARRAY_BUFFER, g_vbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STREAM_DRAW);
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBindBuffer(GL_ARRAY_BUFFER, 0);
  glBindVertexArray(0);
  glDisable(GL_SCISSOR_TEST);
}

CStdDDraw::CStdDDraw() {
  lpPrimary = NULL;
  lpBack = NULL;
  lpDirectDraw = NULL;
  lpPalette = NULL;
  lpClipper = NULL;
  lpWindowClipper = NULL;
  fBackAttached = FALSE;
  fPageLock = FALSE;
  Pattern = NULL;
  PatWdt = PatHgt = PatWdtMod = PatHgtMod = 0;
  PatQuickMod = FALSE;
  Default();
  lpDDraw = this;
}

CStdDDraw::~CStdDDraw() {
  Clear();
  if (lpDDraw == this)
    lpDDraw = NULL;
}

void CStdDDraw::Default() {
  ClipX1 = ClipY1 = 0;
  ClipX2 = 800;
  ClipY2 = 600;
}

void CStdDDraw::Clear() {
  if (std::this_thread::get_id() != g_mainThreadId)
    return;
  DebugLog("DDraw Clear");
  if (g_window) {
    glfwDestroyWindow(g_window);
    g_window = NULL;
  }
  glfwTerminate();
}

BOOL CStdDDraw::Init(HWND hWnd, BOOL Fullscreen, int iResX, int iResY, BOOL fUsePageLock) {
  g_mainThreadId = std::this_thread::get_id();
  DebugLog("DDraw Init Start");

  if (iResX <= 0 || iResX > 4096)
    iResX = 640;
  if (iResY <= 0 || iResY > 4096)
    iResY = 480;

  glfwSetErrorCallback(glfwErrorCallback);

  if (!glfwInit())
    return FALSE;
  printf("glfwInit successful\n");
  glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
  glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 0);
  glfwWindowHint(GLFW_CLIENT_API, GLFW_OPENGL_ES_API);
  if (getenv("CLONK_TEST_HEADLESS"))
    glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE);
  else
    glfwWindowHint(GLFW_VISIBLE, GLFW_TRUE);
  glfwWindowHint(GLFW_DOUBLEBUFFER, GLFW_TRUE);

  printf("glfwCreateWindow(%dx%d)...\n", iResX, iResY);
  // Force windowed mode to avoid driver crashes
  g_window = glfwCreateWindow(iResX, iResY, "Clonk Planet", NULL, NULL);
  if (!g_window)
    return FALSE;
  printf("glfwCreateWindow successful\n");

  glfwMakeContextCurrent(g_window);
  glfwSetWindowSizeCallback(g_window, glfwWindowSizeCallback);
  // Browser requestAnimationFrame schedules presentation after initialization.

  printf("WebGL 2 indexed renderer initialized\n");
  glGetError();

  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);

  glGenTextures(1, &g_paletteTex);
  glBindTexture(GL_TEXTURE_2D, g_paletteTex);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB8, 256, 1, 0, GL_RGB, GL_UNSIGNED_BYTE, NULL);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  uint8_t dummyPal[768] = {0};
  glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 1, GL_RGB, GL_UNSIGNED_BYTE, dummyPal);
  glBindTexture(GL_TEXTURE_2D, 0);

  g_shaderProgramScreen = CreateProgram(vertexShaderSrc, fragmentShaderScreenSrc);
  g_shaderProgramBlit = CreateProgram(vertexShaderSrc, fragmentShaderBlitSrc);
  g_shaderProgramSolid = CreateProgram(vertexShaderSrc, fragmentShaderSolidSrc);
  if(!g_shaderProgramScreen||!g_shaderProgramBlit||!g_shaderProgramSolid)return FALSE;

  glGenVertexArrays(1, &g_vao);
  glGenBuffers(1, &g_vbo);
  glBindVertexArray(g_vao);
  glBindBuffer(GL_ARRAY_BUFFER, g_vbo);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void *)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void *)(2 * sizeof(float)));
  glBindBuffer(GL_ARRAY_BUFFER, 0);
  glBindVertexArray(0);

  lpPrimary = CreateSurface(iResX, iResY);
  lpBack = CreateSurface(iResX, iResY);

  DebugLog("DDraw Init Successful");
  return TRUE;
}

BOOL CStdDDraw::PageFlip() {
  if (std::this_thread::get_id() != g_mainThreadId)
    return FALSE;
  if (!g_window || !lpBack)
    return FALSE;

  CGLSurface *surf = (CGLSurface *)lpBack;
  if (surf->w <= 0 || surf->h <= 0)
    return FALSE;

  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);

  int win_w, win_h;
  glfwGetFramebufferSize(g_window, &win_w, &win_h);

  if (win_w > 0 && win_h > 0) {
    float aspect_src = (float)surf->w / surf->h;
    float aspect_dst = (float)win_w / win_h;

    int draw_w = win_w;
    int draw_h = win_h;
    int draw_x = 0;
    int draw_y = 0;

    if (aspect_dst > aspect_src) {
      // Window is wider than source, pillarbox
      draw_w = (int)(win_h * aspect_src);
      draw_x = (win_w - draw_w) / 2;
    } else {
      // Window is taller than source, letterbox
      draw_h = (int)(win_w / aspect_src);
      draw_y = (win_h - draw_h) / 2;
    }

    DrawHardwareQuad(surf, nullptr, draw_x, draw_y, draw_w, draw_h, 0, 0, -1, -1, false, 0.0f, false, g_shaderProgramScreen);
  }

  glfwSwapBuffers(g_window);
  glfwPollEvents();

  if (glfwWindowShouldClose(g_window)) {
    DebugLog("Window close requested");
    exit(0);
  }

  return TRUE;
}

BOOL CStdDDraw::SetPrimaryPalette(BYTE *pBuf) {
  if (std::this_thread::get_id() != g_mainThreadId)
    return FALSE;
  if (!g_paletteTex || !pBuf)
    return FALSE;
  glBindTexture(GL_TEXTURE_2D, g_paletteTex);
  glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 1, GL_RGB, GL_UNSIGNED_BYTE, pBuf);
  glBindTexture(GL_TEXTURE_2D, 0);
  return TRUE;
}

BOOL CStdDDraw::SetPrimaryPaletteQuad(BYTE *pBuf) {
  if (std::this_thread::get_id() != g_mainThreadId)
    return FALSE;
  if (!g_paletteTex || !pBuf)
    return FALSE;
  BYTE rgb[768];
  for (int i = 0; i < 256; i++) {
    rgb[i * 3 + 0] = pBuf[i * 4 + 2];
    rgb[i * 3 + 1] = pBuf[i * 4 + 1];
    rgb[i * 3 + 2] = pBuf[i * 4 + 0];
  }
  glBindTexture(GL_TEXTURE_2D, g_paletteTex);
  glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 1, GL_RGB, GL_UNSIGNED_BYTE, rgb);
  glBindTexture(GL_TEXTURE_2D, 0);
  return TRUE;
}

BOOL CStdDDraw::AttachPrimaryPalette(SURFACE sfcSurface) { return TRUE; }
BOOL CStdDDraw::GetPrimaryClipper(int &rX1, int &rY1, int &rX2, int &rY2) {
  rX1 = ClipX1;
  rY1 = ClipY1;
  rX2 = ClipX2;
  rY2 = ClipY2;
  return TRUE;
}
BOOL CStdDDraw::SetPrimaryClipper(int iX1, int iY1, int iX2, int iY2) {
  ClipX1 = iX1;
  ClipY1 = iY1;
  ClipX2 = iX2;
  ClipY2 = iY2;
  return TRUE;
}
BOOL CStdDDraw::SubPrimaryClipper(int iX1, int iY1, int iX2, int iY2) {
  ClipX1 = std::max(ClipX1, iX1);
  ClipY1 = std::max(ClipY1, iY1);
  ClipX2 = std::min(ClipX2, iX2);
  ClipY2 = std::min(ClipY2, iY2);
  return TRUE;
}
BOOL CStdDDraw::RestorePrimaryClipper() { return TRUE; }
BOOL CStdDDraw::NoPrimaryClipper() {
  ClipX1 = ClipY1 = 0;
  ClipX2 = 4096;
  ClipY2 = 4096;
  return TRUE;
}

BOOL CStdDDraw::ApplyPrimaryClipper(SURFACE sfcSurface) {
  if (!sfcSurface)
    return FALSE;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  s->fClipped = true;
  return TRUE;
}

BOOL CStdDDraw::DetachPrimaryClipper(SURFACE sfcSurface) {
  if (!sfcSurface)
    return FALSE;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  s->fClipped = false;
  return TRUE;
}

BYTE *CStdDDraw::LockSurface(SURFACE sfcSurface, int &lPitch, int *lpSfcWdt, int *lpSfcHgt) {
  if (!sfcSurface)
    return NULL;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  lPitch = s->pitch;
  if (lpSfcWdt)
    *lpSfcWdt = s->w;
  if (lpSfcHgt)
    *lpSfcHgt = s->h;
  
  SyncSurfaceCPU(s);
  s->dirty_cpu = true;
  return s->bits;
}

void CStdDDraw::UnLockSurface(SURFACE sfcSurface) {}

BOOL CStdDDraw::GetSurfaceSize(SURFACE sfcSurface, int &iWdt, int &iHgt) {
  if (!sfcSurface)
    return FALSE;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  iWdt = s->w;
  iHgt = s->h;
  return TRUE;
}

HDC CStdDDraw::GetSurfaceDC(SURFACE sfcSurface) { return NULL; }

BOOL CStdDDraw::WipeSurface(SURFACE sfcSurface) {
  if (!sfcSurface)
    return FALSE;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  memset(s->bits, 0, s->pitch * s->h);
  s->dirty_cpu = true;
  s->dirty_gpu = false;
  return TRUE;
}

SURFACE CStdDDraw::DuplicateSurface(SURFACE sfcSurface) {
  if (!sfcSurface)
    return NULL;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  SURFACE ns = CreateSurface(s->w, s->h);
  if (!ns)
    return NULL;
  CGLSurface *ns2 = (CGLSurface *)ns;
  
  SyncSurfaceCPU(s);
  
  memcpy(ns2->bits, s->bits, s->pitch * s->h);
  ns2->dirty_cpu = true;
  return ns;
}

void CStdDDraw::DestroySurface(SURFACE sfcSurface) {
  if (!sfcSurface)
    return;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  if (std::this_thread::get_id() == g_mainThreadId) {
    if (s->tex) glDeleteTextures(1, &s->tex);
    if (s->fbo) glDeleteFramebuffers(1, &s->fbo);
  }
  if (s->bits)
    delete[] s->bits;
  delete s;
}

SURFACE CStdDDraw::CreateSurface(int iWdt, int iHgt) {
  if (iWdt <= 0)
    iWdt = 1;
  if (iHgt <= 0)
    iHgt = 1;
  CGLSurface *s = new CGLSurface();
  s->w = iWdt;
  s->h = iHgt;
  s->pitch = iWdt;
  s->bits = new uint8_t[s->pitch * s->h + 32]; // Padding for driver block-writes
  memset(s->bits, 0, s->pitch * s->h + 32);
  s->ColorKey = 0;
  s->useColorKey = true;
  s->fClipped = false;

  // CPU-only until first presentation. No offscreen GPU framebuffer is needed.
  s->tex = 0;
  s->fbo = 0;
  s->dirty_cpu = false;
  s->dirty_gpu = false;
  return (SURFACE)s;
}

void CStdDDraw::SurfaceShiftColor(SURFACE sfcSfc, int iShift) {
  SurfaceShiftColorRange(sfcSfc, 0, 255, iShift);
}

void CStdDDraw::SurfaceShiftColorRange(SURFACE sfcSfc, int iRngLo, int iRngHi, int iShift) {
  if (!sfcSfc)
    return;
  CGLSurface *s = (CGLSurface *)sfcSfc;
  SyncSurfaceCPU(s);
  for (int i = 0; i < s->pitch * s->h; i++) {
    if (Inside((int)s->bits[i], iRngLo, iRngHi)) {
      s->bits[i] = (BYTE)BoundBy((int)s->bits[i] + iShift, 0, 255);
    }
  }
  s->dirty_cpu = true;
}

void CStdDDraw::SurfaceAllowColor(SURFACE sfcSfc, BYTE iRngLo, BYTE iRngHi, BOOL fAllowZero) {
  BYTE *sfcbuf, *lbuf;
  int xcnt, ycnt, pitch, wdt, hgt;
  if (iRngHi < iRngLo) return;
  if (!(sfcbuf = LockSurface(sfcSfc, pitch, &wdt, &hgt))) return;
  for (ycnt = 0; ycnt < hgt; ycnt++) {
    lbuf = sfcbuf + pitch * ycnt;
    for (xcnt = 0; xcnt < wdt; xcnt++, lbuf++) {
      if ((*lbuf != 0) || !fAllowZero) {
        if ((*lbuf < iRngLo) || (*lbuf > iRngHi)) {
          *lbuf = iRngLo + *lbuf % (iRngHi - iRngLo + 1);
        }
      }
    }
  }
  UnLockSurface(sfcSfc);
}

BOOL CStdDDraw::BlitFast(SURFACE sfcSource, int fx, int fy, SURFACE sfcTarget, int tx, int ty, int wdt, int hgt) { 
  return Blit(sfcSource, fx, fy, wdt, hgt, sfcTarget, tx, ty, wdt, hgt, TRUE); 
}

BOOL CStdDDraw::Blit(SURFACE sfcSource, int fx, int fy, int fwdt, int fhgt, SURFACE sfcTarget, int tx, int ty, int twdt, int thgt, BOOL fSrcColKey) {
  if (!sfcSource || !sfcTarget)
    return FALSE;
  CGLSurface *src = (CGLSurface *)sfcSource;
  CGLSurface *dst = (CGLSurface *)sfcTarget;
  if (twdt <= 0 || thgt <= 0) return FALSE;

  DrawHardwareQuad(src, dst, tx, ty, twdt, thgt, fx, fy, fwdt, fhgt, true, 0.0f, fSrcColKey != 0, g_shaderProgramBlit);
  return TRUE;
}

BOOL CStdDDraw::BlitRotate(SURFACE sfcSource, int fx, int fy, int fwdt, int fhgt, SURFACE sfcTarget, int tx, int ty, int twdt, int thgt, int iAngle) {
  if (!sfcSource || !sfcTarget)
    return FALSE;
  CGLSurface *src = (CGLSurface *)sfcSource;
  CGLSurface *dst = (CGLSurface *)sfcTarget;

  DrawHardwareQuad(src, dst, tx, ty, twdt, thgt, fx, fy, fwdt, fhgt, true, (float)iAngle / 100.0f, true, g_shaderProgramBlit);
  return TRUE;
}

BOOL CStdDDraw::BlitRotateOriginal(SURFACE sfcSource, int fx, int fy, int fwdt, int fhgt, SURFACE sfcTarget, int tx, int ty, int twdt, int thgt, int iAngle) {
  return BlitRotate(sfcSource, fx, fy, fwdt, fhgt, sfcTarget, tx, ty, twdt, thgt, iAngle);
}

BOOL CStdDDraw::BlitSurface(SURFACE sfcSurface, SURFACE sfcTarget, int tx, int ty) {
  int w, h;
  if (!GetSurfaceSize(sfcSurface, w, h))
    return FALSE;
  return Blit(sfcSurface, 0, 0, w, h, sfcTarget, tx, ty, w, h, TRUE);
}

BOOL CStdDDraw::BlitSurfaceTile(SURFACE sfcSurface, SURFACE sfcTarget, int iToX, int iToY, int iToWdt, int iToHgt, int iOffsetX, int iOffsetY, BOOL fSrcColKey) {
  int sw, sh;
  if (!GetSurfaceSize(sfcSurface, sw, sh))
    return FALSE;

  CGLSurface *src = (CGLSurface *)sfcSurface;
  CGLSurface *dst = (CGLSurface *)sfcTarget;
  if (!src || !dst) return FALSE;

  // GPU tile blit would require a different shader or sampler settings.
  // For now, keep it on CPU or implement better.
  SyncSurfaceCPU(src);
  SyncSurfaceCPU(dst);

  for (int y = 0; y < iToHgt; y++) {
    int ty = iToY + y;
    int sy = (y + iOffsetY) % sh;
    if (sy < 0) sy += sh;
    for (int x = 0; x < iToWdt; x++) {
      int tx = iToX + x;
      int sx = (x + iOffsetX) % sw;
      if (sx < 0) sx += sw;

      uint8_t c = src->bits[sy * src->pitch + sx];
      if (!fSrcColKey || c != 0) {
        if (tx >= 0 && tx < dst->w && ty >= 0 && ty < dst->h)
          dst->bits[ty * dst->pitch + tx] = c;
      }
    }
  }
  dst->dirty_cpu = true;
  return TRUE;
}

BOOL CStdDDraw::BlitSurface2Window(SURFACE sfcSource, int fX, int fY, int fWdt, int fHgt, HWND hWnd, int tX, int tY, int tWdt, int tHgt) { return TRUE; }

BOOL CStdDDraw::InitFont(const char *szFontName, int iSize) { return Font.Init(NULL, szFontName, iSize); }
BOOL CStdDDraw::TextExtent(const char *szString, int &rWdt, int &rHgt) { return Font.TextExtent(szString, rWdt, rHgt); }
int CStdDDraw::TextHeight(const char *szText) { return Font.GetTextHeight(szText); }
int CStdDDraw::TextWidth(const char *szText) { return Font.GetTextWidth(szText); }
BOOL CStdDDraw::TextOut(const char *szText, SURFACE sfcDest, int iTx, int iTy, int iFCol, int iBCol, BYTE byForm) { return Font.TextOut(szText, sfcDest, iTx, iTy, iFCol, iBCol, byForm); }
BOOL CStdDDraw::StringOut(const char *szText, SURFACE sfcDest, int iTx, int iTy, int iFCol, int iBCol, BYTE byForm) { return Font.StringOut(szText, sfcDest, iTx, iTy, iFCol, iBCol, byForm); }

BOOL CStdDDraw::SetPixel(SURFACE sfcDest, int tx, int ty, BYTE col) {
  if (!sfcDest)
    return FALSE;
  CGLSurface *dst = (CGLSurface *)sfcDest;
  SyncSurfaceCPU(dst);
  if (tx >= 0 && tx < dst->w && ty >= 0 && ty < dst->h) {
    dst->bits[ty * dst->pitch + tx] = col;
    dst->dirty_cpu = true;
  }
  return TRUE;
}

BYTE CStdDDraw::GetPixel(SURFACE sfcSource, int fx, int fy) {
  if (!sfcSource)
    return 0;
  CGLSurface *src = (CGLSurface *)sfcSource;
  SyncSurfaceCPU(src);
  if (fx >= 0 && fx < src->w && fy >= 0 && fy < src->h) {
    return src->bits[fy * src->pitch + fx];
  }
  return 0;
}

void CStdDDraw::DrawBox(SURFACE sfcDest, int x1, int y1, int x2, int y2, BYTE col) {
  if (!sfcDest)
    return;
  CGLSurface *dst = (CGLSurface *)sfcDest;
  if (x2 < x1 || y2 < y1) return;
  
  if (Pattern) {
    SyncSurfaceCPU(dst);
    if (x1 < std::max(0, ClipX1)) x1 = std::max(0, ClipX1);
    if (x2 > std::min(dst->w - 1, ClipX2)) x2 = std::min(dst->w - 1, ClipX2);
    if (y1 < std::max(0, ClipY1)) y1 = std::max(0, ClipY1);
    if (y2 > std::min(dst->h - 1, ClipY2)) y2 = std::min(dst->h - 1, ClipY2);
    if (x1 > x2 || y1 > y2) return;

    for (int y = y1; y <= y2; y++) {
      uint8_t *pLine = dst->bits + y * dst->pitch;
      uint8_t *bypPatLine;
      if (PatQuickMod) {
        bypPatLine = Pattern + PatWdt * (y & PatHgtMod);
        for (int x = x1; x <= x2; x++) {
          pLine[x] = col + bypPatLine[x & PatWdtMod];
        }
      } else {
        bypPatLine = Pattern + PatWdt * (y % PatHgt);
        for (int x = x1; x <= x2; x++) {
          pLine[x] = col + bypPatLine[x % PatWdt];
        }
      }
    }
    dst->dirty_cpu = true;
    return;
  }

  DrawHardwareQuad(nullptr, dst, x1, y1, x2 - x1 + 1, y2 - y1 + 1, 0, 0, -1, -1, true, 0.0f, false, g_shaderProgramSolid, (uint32_t)col);
}

void CStdDDraw::DrawBoxColorTable(SURFACE sfcDest, int x1, int y1, int x2, int y2, BYTE *bypColorTable) {
  if (!sfcDest || !bypColorTable)
    return;
  CGLSurface *dst = (CGLSurface *)sfcDest;
  SyncSurfaceCPU(dst);
  if (x1 < std::max(0, ClipX1)) x1 = std::max(0, ClipX1);
  if (x2 > std::min(dst->w - 1, ClipX2)) x2 = std::min(dst->w - 1, ClipX2);
  if (y1 < std::max(0, ClipY1)) y1 = std::max(0, ClipY1);
  if (y2 > std::min(dst->h - 1, ClipY2)) y2 = std::min(dst->h - 1, ClipY2);
  if (x1 > x2 || y1 > y2) return;

  for (int y = y1; y <= y2; y++) {
    uint8_t *pLine = dst->bits + y * dst->pitch;
    for (int x = x1; x <= x2; x++) {
      pLine[x] = bypColorTable[pLine[x]];
    }
  }
  dst->dirty_cpu = true;
}

void CStdDDraw::DrawCircle(SURFACE sfcDest, int x, int y, int r, BYTE col) {
  if (!sfcDest)
    return;
  for (int i = 0; i < 360; i++) {
    double angle = i * 3.14159265 / 180.0;
    int px = x + (int)(r * cos(angle));
    int py = y + (int)(r * sin(angle));
    SetPixel(sfcDest, px, py, col);
  }
}

void CStdDDraw::DrawHorizontalLine(SURFACE sfcDest, int x1, int x2, int y, BYTE col) { 
  if (x1 > x2) std::swap(x1, x2);
  DrawBox(sfcDest, x1, y, x2, y, col); 
}

void CStdDDraw::DrawVerticalLine(SURFACE sfcDest, int x, int y1, int y2, BYTE col) { 
  if (y1 > y2) std::swap(y1, y2);
  DrawBox(sfcDest, x, y1, x, y2, col); 
}

void CStdDDraw::DrawFrame(SURFACE sfcDest, int x1, int y1, int x2, int y2, BYTE col) {
  DrawHorizontalLine(sfcDest, x1, x2, y1, col);
  DrawHorizontalLine(sfcDest, x1, x2, y2, col);
  DrawVerticalLine(sfcDest, x1, y1, y2, col);
  DrawVerticalLine(sfcDest, x2, y1, y2, col);
}

void CStdDDraw::DrawInline(SURFACE sfcDest, int iX1, int iY1, int iX2, int iY2, BYTE byCol, BYTE byOnCol, BYTE byAdjacentCol) {
  if (!sfcDest) return;
  CGLSurface *dst = (CGLSurface *)sfcDest;
  SyncSurfaceCPU(dst);
  
  if ((iX2 < std::max(0, ClipX1)) || (iX1 > std::min(dst->w - 1, ClipX2)) 
   || (iY2 < std::max(0, ClipY1)) || (iY1 > std::min(dst->h - 1, ClipY2))) {
    return;
  }
  
  if (iX1 < std::max(0, ClipX1)) iX1 = std::max(0, ClipX1); 
  if (iX2 > std::min(dst->w - 1, ClipX2)) iX2 = std::min(dst->w - 1, ClipX2); 
  if (iY1 < std::max(0, ClipY1)) iY1 = std::max(0, ClipY1); 
  if (iY2 > std::min(dst->h - 1, ClipY2)) iY2 = std::min(dst->h - 1, ClipY2);
  
  for (int cx = iX1; cx <= iX2; cx++) {
    for (int cy = iY1; cy <= iY2; cy++) {
      if (dst->bits[dst->pitch * cy + cx] == byOnCol) {
        if ((cx == iX1) || (dst->bits[dst->pitch * cy + cx - 1] == byAdjacentCol)
         || (cx == iX2) || (dst->bits[dst->pitch * cy + cx + 1] == byAdjacentCol)
         || (cy == iY1) || (dst->bits[dst->pitch * (cy - 1) + cx] == byAdjacentCol)
         || (cy == iY2) || (dst->bits[dst->pitch * (cy + 1) + cx] == byAdjacentCol)) {
          dst->bits[dst->pitch * cy + cx] = byCol;
        }
      }
    }
  }
  dst->dirty_cpu = true;
}

BOOL CStdDDraw::DrawLine(SURFACE sfcTarget, int x1, int y1, int x2, int y2, BYTE byCol) {
  int dx = abs(x2 - x1);
  int dy = abs(y2 - y1);
  int sx = (x1 < x2) ? 1 : -1;
  int sy = (y1 < y2) ? 1 : -1;
  int err = dx - dy;

  while (true) {
    SetPixel(sfcTarget, x1, y1, byCol);
    if (x1 == x2 && y1 == y2)
      break;
    int e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }
  return TRUE;
}

BOOL CStdDDraw::DrawPolygon(SURFACE sfcTarget, int iNum, int *ipVtx, int iCol) {
  if (iNum < 3 || !sfcTarget)
    return FALSE;
  CGLSurface *dst = (CGLSurface *)sfcTarget;
  SyncSurfaceCPU(dst);
  int top = dst->h, bottom = 0;
  for (int i = 0; i < iNum; i++) {
    if (ipVtx[i * 2 + 1] < top)
      top = ipVtx[i * 2 + 1];
    if (ipVtx[i * 2 + 1] > bottom)
      bottom = ipVtx[i * 2 + 1];
  }
  top = std::max(0, top);
  bottom = std::min(dst->h - 1, bottom);

  for (int y = top; y <= bottom; y++) {
    std::vector<int> nodes;
    int j = iNum - 1;
    for (int i = 0; i < iNum; i++) {
      if ((ipVtx[i * 2 + 1] < y && ipVtx[j * 2 + 1] >= y) || (ipVtx[j * 2 + 1] < y && ipVtx[i * 2 + 1] >= y)) {
        nodes.push_back(ipVtx[i * 2] + (y - ipVtx[i * 2 + 1]) * (ipVtx[j * 2] - ipVtx[i * 2]) / (ipVtx[j * 2 + 1] - ipVtx[i * 2 + 1]));
      }
      j = i;
    }
    std::sort(nodes.begin(), nodes.end());
    for (size_t i = 0; i < nodes.size(); i += 2) {
      if (i + 1 >= nodes.size())
        break;
      DrawHorizontalLine(sfcTarget, nodes[i], nodes[i + 1], y, iCol);
    }
  }
  return TRUE;
}

BOOL CStdDDraw::DefinePattern(SURFACE sfcSource) {
  int lPitch, lWdt, lHgt;
  BYTE *sfcbuf;
  if (!sfcSource) return FALSE;
  NoPattern();
  if (!(sfcbuf = LockSurface(sfcSource, lPitch, &lWdt, &lHgt))) return FALSE;
  PatWdt = lWdt; PatHgt = lHgt;
  int twdt, thgt;
  for (twdt = 1; twdt < lWdt; twdt <<= 1);
  for (thgt = 1; thgt < lHgt; thgt <<= 1);
  if ((twdt == lWdt) && (thgt == lHgt)) {
    PatQuickMod = TRUE; PatWdtMod = PatWdt - 1; PatHgtMod = PatHgt - 1;
  }
  if (!(Pattern = new BYTE[PatWdt * PatHgt])) {
    UnLockSurface(sfcSource);
    return FALSE;
  }
  for (int cy = 0; cy < PatHgt; cy++)
    memcpy(Pattern + cy * PatWdt, sfcbuf + cy * lPitch, PatWdt);
  UnLockSurface(sfcSource);
  return TRUE;
}

void CStdDDraw::NoPattern() {
  if (Pattern) delete[] Pattern;
  Pattern = NULL;
  PatQuickMod = FALSE;
}

BOOL CStdDDraw::CreatePrimaryPalette(SURFACE sfcAttachTo) { return TRUE; }
BOOL CStdDDraw::CreatePrimaryClipper() { return TRUE; }
BOOL CStdDDraw::CreatePrimarySurfaces(BOOL fFlipAttach) { return TRUE; }
BOOL CStdDDraw::Error(const char *szMsg) { return FALSE; }
BOOL CStdDDraw::SetDisplayMode(int iResX, int iResY, int iColorDepth) {
  if (std::this_thread::get_id() != g_mainThreadId)
    return FALSE;
  if (!g_window)
    return FALSE;
  glfwSetWindowSize(g_window, iResX, iResY);
  return TRUE;
}

BOOL CStdDDraw::SetCooperativeLevel(HWND hWnd, DWORD dwLevel) {
  if (std::this_thread::get_id() != g_mainThreadId)
    return FALSE;
  if (!g_window)
    return FALSE;
  // DDraw levels: DDSCL_FULLSCREEN (0x00000001)
  if (dwLevel & 0x00000001) {
    GLFWmonitor *monitor = glfwGetPrimaryMonitor();
    const GLFWvidmode *mode = glfwGetVideoMode(monitor);
    glfwSetWindowMonitor(g_window, monitor, 0, 0, mode->width, mode->height, mode->refreshRate);
  } else {
    glfwSetWindowMonitor(g_window, NULL, 100, 100, 800, 600, 0);
  }
  return TRUE;
}

BOOL CStdDDraw::CreateDirectDraw() { return TRUE; }
int CStdDDraw::SfcCall(HRESULT ddrval) { return 0; }

BOOL CStdDDraw::SurfaceSetColorKey(SURFACE sfcSurface, BYTE byCol) {
  if (!sfcSurface)
    return FALSE;
  CGLSurface *s = (CGLSurface *)sfcSurface;
  s->ColorKey = byCol;
  s->useColorKey = true;
  return TRUE;
}

extern "C" int PlanetResizeRender(int canvasWidth,int canvasHeight,int logicalWidth,int logicalHeight) {
  if(!g_window||!Engine.DDraw.lpBack)return -2;
  glfwSetWindowSize(g_window,canvasWidth,canvasHeight);
  if(Config.Graphics.ResX==logicalWidth&&Config.Graphics.ResY==logicalHeight)return 1;
  SURFACE back=Engine.DDraw.CreateSurface(logicalWidth,logicalHeight),primary=Engine.DDraw.CreateSurface(logicalWidth,logicalHeight);
  if(!back||!primary){if(back)Engine.DDraw.DestroySurface(back);if(primary)Engine.DDraw.DestroySurface(primary);return -3;}
  Engine.DDraw.DestroySurface(Engine.DDraw.lpBack);Engine.DDraw.DestroySurface(Engine.DDraw.lpPrimary);
  Engine.DDraw.lpBack=back;Engine.DDraw.lpPrimary=primary;
  Config.Graphics.ResX=logicalWidth;Config.Graphics.ResY=logicalHeight;
  Game.GraphicsSystem.MessageBoard.Output.Surface=back;
  Game.GraphicsSystem.MessageBoard.Output.Wdt=logicalWidth;
  Game.GraphicsSystem.MessageBoard.Output.Y=logicalHeight-Game.GraphicsSystem.MessageBoard.Output.Hgt;
  Game.GraphicsSystem.RecalculateViewports();
  return 1;
}
