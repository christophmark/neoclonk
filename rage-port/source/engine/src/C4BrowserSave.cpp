// Browser save-button boundary: original QuickSave and original .c4s groups.
// No serializer, simulation changes, script evaluation, or overwrite slots here.
#include <C4Include.h>
#include <C4Game.h>
#include <C4Config.h>
#include <C4Player.h>
#include <C4Group.h>
#include <C4Components.h>
#include <emscripten/emscripten.h>
#include <sys/stat.h>
#include <cerrno>
#include <ctime>
#include <climits>
#include <cstdio>

namespace {
StdStrBuf SaveStatusJson, SavePath, SaveError;
const char *SaveState = "idle";
int SaveRequest = 0, SaveFrame = 0;
unsigned SaveSequence = 0;
bool SaveBusy = false, SaveWasPaused = false;
long long SaveBytes = 0;

void SaveJsonString(StdStrBuf &out, const char *value)
{
  out.AppendChar('"');
  if(value)for(const unsigned char *p=reinterpret_cast<const unsigned char *>(value);*p;++p)
  {
    if(*p=='"' || *p=='\\'){out.AppendChar('\\');out.AppendChar(*p);}
    else if(*p<32 || *p>=127)out.AppendFormat("\\u%04x",static_cast<unsigned>(*p));
    else out.AppendChar(*p);
  }
  out.AppendChar('"');
}

bool CanBrowserSave()
{
  // Frame > 0 and an initialized player exclude the early IsRunning startup
  // interval. The browser port currently provides a local single-player game.
  return Game.IsRunning && Game.FrameCounter>0 && Game.Players.First &&
         !Game.Network.isEnabled() && !Game.Control.isReplay() && Game.CanQuickSave();
}

void SaveFailed(const char *message)
{
  SaveError.Copy(message);SaveState="error";SaveBusy=false;
}

void SaveAtBrowserBoundary(void *)
{
  if(!SaveBusy)return;
  if(!CanBrowserSave()){SaveFailed("The original game is not available for saving.");return;}
  SaveState="saving";SaveFrame=Game.FrameCounter;SaveWasPaused=Game.IsPaused();
  // The callback runs after the initiating JS/WASM call has returned. Browser
  // engine execution is single-threaded; no gameplay tick can interleave with
  // this synchronous original save. Preserve even a pre-existing multiple halt.
  struct PreservePause {
    bool pausedHere;
    PreservePause():pausedHere(!Game.IsPaused()){if(pausedHere)Game.Pause();}
    ~PreservePause(){if(pausedHere && Game.IsRunning && Game.HaltCount==1)Game.Unpause();}
  } preservePause;

  const char *folder=Config.General.SaveGameFolder.getData();
  if(!folder || !*folder){SaveFailed("The original save folder is unavailable.");return;}
  StdStrBuf absoluteFolder;
  if(folder[0]=='/')absoluteFolder.Copy(folder);
  else absoluteFolder.Format("%s%s",Config.General.ExePath,folder);

  const time_t now=time(NULL);struct tm utc;
  if(!gmtime_r(&now,&utc)){SaveFailed("Could not create a save timestamp.");return;}
  StdStrBuf filename;struct stat info;
  bool unique=false;
  for(unsigned attempt=0;attempt<10000;++attempt)
  {
    if(++SaveSequence==0)++SaveSequence;
    filename.Format("Neoclonk-%04d%02d%02d-%02d%02d%02d-%u.c4s",
      utc.tm_year+1900,utc.tm_mon+1,utc.tm_mday,utc.tm_hour,utc.tm_min,utc.tm_sec,SaveSequence);
    SavePath.Format("%s/%s",absoluteFolder.getData(),filename.getData());
    // lstat recognizes files, directories and symlinks. QuickSave's original
    // save routine replaces its target, so it must only receive a new path.
    if(lstat(SavePath.getData(),&info)==0)continue;
    if(errno!=ENOENT){SaveFailed("Could not check the destination save path.");return;}
    unique=true;break;
  }
  if(!unique){SaveFailed("Could not allocate a new save filename.");return;}

  // Same entry point as C4MainMenu's Save:Game command. This invokes original
  // C4GameSaveSavegame::OnSaving, including SynchronizeLocalFiles, and writes
  // the original full scenario/runtime/player/material representation.
  if(!Game.QuickSave(filename.getData(),Game.ScenarioTitle.getData()))
  {SaveFailed("The original engine could not save this game.");return;}

  // QuickSave logs completion after closing its original group. Verify the
  // resulting group is readable before advertising success to the host.
  C4Group saved;
  if(!saved.Open(SavePath.getData()) || !saved.FindEntry(C4CFN_ScenarioCore) || !saved.FindEntry(C4CFN_Game))
  {SaveFailed("The saved original game could not be verified.");return;}
  saved.Close();
  if(lstat(SavePath.getData(),&info)==0)SaveBytes=static_cast<long long>(info.st_size);
  SaveState="saved";SaveBusy=false;
}
}

extern "C" {
// Positive request ID means accepted, not persisted. Poll status, then perform
// FS.syncfs(false) in the host and report IndexedDB success separately.
EMSCRIPTEN_KEEPALIVE int nc_browser_save()
{
  if(SaveBusy)return -2;
  if(!CanBrowserSave())return -1;
  SaveRequest=SaveRequest==INT_MAX?1:SaveRequest+1;
  SaveState="pending";SavePath.Clear();SaveError.Clear();SaveBytes=0;
  SaveFrame=Game.FrameCounter;SaveWasPaused=Game.IsPaused();SaveBusy=true;
  emscripten_async_call(SaveAtBrowserBoundary,NULL,0);
  return SaveRequest;
}

EMSCRIPTEN_KEEPALIVE const char *nc_browser_save_status()
{
  SaveStatusJson.Format("{\"requestId\":%d,\"status\":",SaveRequest);SaveJsonString(SaveStatusJson,SaveState);
  SaveStatusJson.Append(",\"path\":");SaveJsonString(SaveStatusJson,SavePath.getData());
  // The original safe-format validator predates the ll length modifier.
  char bytesText[32];snprintf(bytesText,sizeof(bytesText),"%lld",SaveBytes);
  SaveStatusJson.AppendFormat(",\"frame\":%d,\"paused\":%s,\"bytes\":%s,\"error\":",
    SaveFrame,SaveWasPaused?"true":"false",bytesText);
  SaveJsonString(SaveStatusJson,SaveError.getData());SaveStatusJson.AppendChar('}');
  return SaveStatusJson.getData();
}
}
