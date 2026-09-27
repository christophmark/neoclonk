// Transport-independent original-control lockstep. WebRTC carries these bytes;
// simulation, command interpretation and binary format remain the original engine.
#include <C4Include.h>
#include <C4BrowserNetwork.h>
#include <C4Game.h>
#include <C4Player.h>
#include <C4Control.h>
#include <C4Viewport.h>
#include <C4Random.h>
#include <emscripten/emscripten.h>

namespace {
bool enabled=false, decoding=false, decodingBootstrap=false, selected=false;
unsigned seed=0;
int localPlayer=-1, totalPlayers=0, acceptedFrame=-1, builtFrame=-1;
C4Control incoming, pending;
StdBuf output;
StdStrBuf status;
const unsigned MaxInput=65536, MaxFrame=1048576;
int packetPlayer(C4IDPacket *packet) {
  switch(packet->getPktType()) {
    case CID_PlrSelect: return static_cast<C4ControlPlayerSelect *>(packet->getPkt())->BrowserPlayer();
    case CID_PlrControl: return static_cast<C4ControlPlayerControl *>(packet->getPkt())->BrowserPlayer();
    case CID_PlrCommand: return static_cast<C4ControlPlayerCommand *>(packet->getPkt())->BrowserPlayer();
    default:return -1;
  }
}
bool decode(C4Control &result, const void *bytes, unsigned length, bool bootstrap) {
  if(!bytes || !length || length>MaxFrame)return false;
  decoding=true; decodingBootstrap=bootstrap;
  try { CompileFromBuf<StdCompilerBinRead>(result,StdBuf(bytes,length)); }
  catch(StdCompiler::Exception *error){delete error;decoding=false;result.Clear();return false;}
  catch(...){decoding=false;result.Clear();return false;}
  decoding=false;
  unsigned count=0;
  for(C4IDPacket *p=result.firstPkt();p;p=result.nextPkt(p))if(++count>512){result.Clear();return false;}
  return true;
}
const void *serialize(C4Control &control) {
  output=DecompileToBuf<StdCompilerBinWrite>(control);
  return output.getData();
}
}

bool BrowserNetworkEnabled(){return enabled;}
void BrowserNetworkSeed(){if(enabled)Game.Parameters.RandomSeed=seed;}
bool BrowserNetworkReady(){return !enabled || acceptedFrame==Game.FrameCounter;}
void BrowserNetworkTake(C4Control &control){control.Take(incoming);acceptedFrame=-1;}
bool BrowserNetworkQueue(int type,C4ControlPacket *packet) {
  if(!enabled || !Game.IsRunning || !packet->Sync())return false;
  Game.Control.Input.Add(static_cast<C4PacketType>(type),packet);return true;
}
bool BrowserNetworkDecodeAllowed(int type) {
  if(!decoding)return true;
  if(type==PID_None || type==CID_PlrSelect || type==CID_PlrControl || type==CID_PlrCommand)return true;
  return decodingBootstrap && type==CID_JoinPlr;
}
void BrowserNetworkAfterControl() {
  if(!enabled || selected || !Game.Players.Get(localPlayer))return;
  // Only device presentation/input ownership differs. Native player ownership,
  // teams, inventories, crew and simulation state stay identical on every peer.
  for(C4Player *p=Game.Players.First;p;p=p->Next) {
    p->LocalControl=(p->Number==localPlayer);
    p->Control=p->LocalControl?C4P_Control_Keyboard1:C4P_Control_None;
    if(!p->LocalControl) {
      p->MouseControl=FALSE;
      Game.GraphicsSystem.CloseViewport(p->Number,true);
    }
  }
  selected=true;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE int nc_browser_net_configure(unsigned randomSeed,int player,int players) {
  if(Game.IsRunning || enabled || player<0 || player>=players || players<2 || players>12)return -1;
  enabled=true;seed=randomSeed;localPlayer=player;totalPlayers=players;return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned nc_browser_net_size(){return output.getSize();}
EMSCRIPTEN_KEEPALIVE const void *nc_browser_net_drain() {
  output.Clear();if(!enabled || !Game.IsRunning || !selected)return NULL;
  C4Control outgoing;
  // Take the queue, then discard engine-local diagnostics and non-owned inputs.
  outgoing.Take(Game.Control.Input);
  for(C4IDPacket *p=outgoing.firstPkt(),*next;p;p=next) {
    next=outgoing.nextPkt(p);if(packetPlayer(p)!=localPlayer)outgoing.Delete(p);
  }
  return serialize(outgoing);
}
EMSCRIPTEN_KEEPALIVE int nc_browser_net_admit(int origin,const void *bytes,unsigned length) {
  if(!enabled || localPlayer!=0 || !selected || origin<0 || origin>=totalPlayers || length>MaxInput)return -1;
  C4Control batch;if(!decode(batch,bytes,length,false))return -2;
  for(C4IDPacket *p=batch.firstPkt();p;p=batch.nextPkt(p))if(packetPlayer(p)!=origin)return -3;
  // Prevent an unbounded queue while a peer has stopped acknowledging frames.
  StdBuf test=DecompileToBuf<StdCompilerBinWrite>(pending);
  if(test.getSize()+length>MaxFrame)return -4;
  pending.Append(batch);return 1;
}
EMSCRIPTEN_KEEPALIVE const void *nc_browser_net_build(int frame) {
  output.Clear();
  if(!enabled || localPlayer!=0 || !Game.IsRunning || frame!=Game.FrameCounter || frame==builtFrame || acceptedFrame>=0)return NULL;
  C4Control batch;
  if(!selected)batch.Take(Game.Control.Input);else batch.Take(pending);
  builtFrame=frame;return serialize(batch);
}
EMSCRIPTEN_KEEPALIVE int nc_browser_net_accept(int frame,const void *bytes,unsigned length) {
  if(!enabled || !Game.IsRunning || frame!=Game.FrameCounter || acceptedFrame>=0)return -1;
  C4Control batch;if(!decode(batch,bytes,length,!selected))return -2;
  if(!selected)Game.Control.Input.Clear(); // host's canonical startup joins win
  incoming.Take(batch);acceptedFrame=frame;return 1;
}
EMSCRIPTEN_KEEPALIVE const void *nc_browser_net_sync() {
  output.Clear();if(!enabled || !Game.IsRunning)return NULL;
  C4ControlSyncCheck check;check.Set();
  output=DecompileToBuf<StdCompilerBinWrite>(check);
  // Original checker plus the main random stream, which is useful in QA reports.
  output.Append(&RandomHold,sizeof(RandomHold));return output.getData();
}
EMSCRIPTEN_KEEPALIVE const char *nc_browser_net_status() {
  status.Format("{\"enabled\":%s,\"running\":%s,\"playersJoined\":%s,\"frame\":%d,\"acceptedFrame\":%d,\"localPlayerIndex\":%d,\"totalPlayers\":%d,\"seed\":%u}",
    enabled?"true":"false",Game.IsRunning?"true":"false",selected?"true":"false",Game.FrameCounter,acceptedFrame,localPlayer,totalPlayers,seed);
  return status.getData();
}
}
