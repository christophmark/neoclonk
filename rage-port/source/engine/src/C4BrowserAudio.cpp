// Compatibility boundary for Emscripten's SDL1/Web Audio mixer emulation.
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <climits>
#ifndef C4_BROWSER_AUDIO_PARSER_ONLY
#include <C4Include.h>
#include <C4Application.h>
#include <C4MusicSystem.h>
#include <SDL_mixer.h>
#include <emscripten/emscripten.h>

static bool BrowserMixerOpen = false;
extern "C" void C4BrowserAudioOpened(int value) { BrowserMixerOpen = value != 0; }

extern "C" const SDL_version * SDLCALL Mix_Linked_Version(void)
{
  // API compatibility level of the SDL_mixer headers used by the emulation;
  // there is no native dynamically linked SDL_mixer library in the browser.
  static const SDL_version compatibility = {
    SDL_MIXER_MAJOR_VERSION, SDL_MIXER_MINOR_VERSION, SDL_MIXER_PATCHLEVEL
  };
  return &compatibility;
}

extern "C" int SDLCALL Mix_QuerySpec(int *frequency, Uint16 *format, int *channels)
{
  if (!BrowserMixerOpen) return 0;
  return EM_ASM_INT({
    if (typeof SDL === 'undefined' || !SDL.audioContext) return 0;
    if ($0) HEAP32[$0 >> 2] = SDL.mixerFrequency;
    if ($1) HEAPU16[$1 >> 1] = SDL.mixerFormat;
    if ($2) HEAP32[$2 >> 2] = SDL.mixerNumChannels;
    return 1;
  }, frequency, format, channels);
}

#endif // platform mixer bindings

namespace {
uint16_t AudioU16(const unsigned char *p) { return uint16_t(p[0]) | uint16_t(p[1]) << 8; }
uint32_t AudioU32(const unsigned char *p) { return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24; }
uint64_t AudioU64(const unsigned char *p) { return uint64_t(AudioU32(p)) | uint64_t(AudioU32(p+4)) << 32; }
bool AudioDuration(uint64_t units, uint32_t unitsPerSecond, uint32_t rate, int *milliseconds, int *sampleRate, int *legacyLength)
{
  if (!unitsPerSecond || !rate || rate > INT_MAX || units > UINT64_MAX / 1000) return false;
  const uint64_t duration = units * 1000 / unitsPerSecond;
  if (!duration || duration > INT_MAX) return false;
  *milliseconds = static_cast<int>(duration); *sampleRate = static_cast<int>(rate);
  // Preserve Rage's SDL backend lifetime calculation (including its historical
  // stereo factor): 1000 * convertedChunkBytes / (44100 * 2). Browser decoding
  // has no C Mix_Chunk; derive the 44100Hz/stereo/S16 converted byte count.
  const uint64_t mixerFrames = (units / unitsPerSecond) * 44100u + (units % unitsPerSecond) * 44100u / unitsPerSecond;
  const uint32_t mixerBytes = static_cast<uint32_t>(mixerFrames * 4u);
  *legacyLength = static_cast<int>((mixerBytes * uint32_t(1000)) / (44100u * 2u));
  return true;
}
}

// Read duration from the original encoded bytes before asynchronous Web Audio
// decoding. SDL1's browser Mix_Chunk is a JS handle, not a C struct to dereference.
extern "C" int C4BrowserSoundInfo(const unsigned char *data, size_t size, int *milliseconds, int *sampleRate, int *legacyLength)
{
  if (!data || !milliseconds || !sampleRate || !legacyLength) return 0;
  *milliseconds=0;*sampleRate=0;*legacyLength=0;
  if (size>=12 && !memcmp(data,"RIFF",4) && !memcmp(data+8,"WAVE",4))
  {
    const uint32_t riffSize=AudioU32(data+4);
    if (riffSize<4 || riffSize>size-8) return 0;
    const size_t end=static_cast<size_t>(riffSize)+8;
    uint32_t rate=0,byteRate=0,factSamples=0;uint16_t encoding=0;uint64_t dataBytes=0;
    for (size_t pos=12;pos<=end && end-pos>=8;)
    {
      const uint32_t length=AudioU32(data+pos+4);const size_t body=pos+8;
      if (length>end-body) return 0;
      if (!memcmp(data+pos,"fmt ",4))
      {
        if(length<16)return 0;
        encoding=AudioU16(data+body);rate=AudioU32(data+body+4);byteRate=AudioU32(data+body+8);
        if(!AudioU16(data+body+2) || !AudioU16(data+body+12))return 0;
      }
      else if(!memcmp(data+pos,"data",4))dataBytes+=length;
      else if(!memcmp(data+pos,"fact",4) && length>=4)factSamples=AudioU32(data+body);
      pos=body+length+(length&1u);
    }
    if(factSamples)return AudioDuration(factSamples,rate,rate,milliseconds,sampleRate,legacyLength);
    if(encoding!=1 && encoding!=3 && encoding!=0xfffe)return 0;
    return AudioDuration(dataBytes,byteRate,rate,milliseconds,sampleRate,legacyLength);
  }
  if(size>=27 && !memcmp(data,"OggS",4))
  {
    uint32_t rate=0,serial=0;uint64_t samples=0;bool ended=false;
    for(size_t pos=0;pos<size;)
    {
      if(size-pos<27 || memcmp(data+pos,"OggS",4) || data[pos+4]!=0)return 0;
      const size_t segments=data[pos+26],header=27+segments;
      if(header>size-pos)return 0;
      size_t bodySize=0;for(size_t i=0;i<segments;++i)bodySize+=data[pos+27+i];
      if(bodySize>size-pos-header)return 0;
      const unsigned char *body=data+pos+header;
      const uint32_t pageSerial=AudioU32(data+pos+14);
      if(!rate && bodySize>=16 && body[0]==1 && !memcmp(body+1,"vorbis",6))
      {rate=AudioU32(body+12);serial=pageSerial;}
      if(rate && pageSerial==serial)
      {
        const uint64_t granule=AudioU64(data+pos+6);
        if(granule!=UINT64_MAX && granule>samples)samples=granule;
        if(data[pos+5]&4)ended=true;
      }
      pos+=header+bodySize;
    }
    // Shipped sound effects are single Vorbis streams. Require a complete stream
    // so a truncated effect cannot silently receive a guessed playback length.
    return ended && AudioDuration(samples,rate,rate,milliseconds,sampleRate,legacyLength);
  }
  return 0;
}
