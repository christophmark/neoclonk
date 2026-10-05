// Browser transport adapter for Planet's original C4Control packet stream.
// No socket server is required: the JS host orders these bytes over WebRTC.
#include <C4Include.h>
#include <emscripten.h>
#include <vector>
#include <string>
#include <sstream>
#include <cstdint>
#include <cstring>
extern bool PlanetReady;
extern unsigned int PlanetRandomState;
namespace {
bool enabled=false,selected=false;
unsigned int seed=0;
int localSlot=-1,totalPlayers=0,acceptedFrame=-1,builtFrame=-1;
C4Control incoming,pending;
std::vector<unsigned char> output;
std::string status;
const unsigned MaxInput=65536,MaxFrame=1048576,Header=17;
static_assert(sizeof(C4PacketHeader)==Header,"Planet packet header ABI changed");
int playerNumber(int slot){int n=-1;for(int i=0;i<=slot;++i){int next=2147483647;for(C4Player*p=Game.Players.First;p;p=p->Next)if(p->Number>n&&p->Number<next)next=p->Number;if(next==2147483647)return -1;n=next;}return n;}
int i32(const unsigned char*p){int n;memcpy(&n,p,4);return n;}
// Validate before calling the original GetStatic parser, which trusts packet sizes.
bool validate(const unsigned char*bytes,unsigned length,int owner,C4Control&result){
 if(!bytes||length<Header||length>MaxFrame||memcmp(bytes,"C4PK\0",5)||i32(bytes+5)!=C4PK_Control||i32(bytes+9)!=int(length-Header))return false;
 unsigned offset=Header,count=0;
 while(offset<length){
  if(length-offset<Header||++count>512||memcmp(bytes+offset,"C4PK\0",5))return false;
  int type=i32(bytes+offset+5),size=i32(bytes+offset+9);offset+=Header;
  if(size<4||unsigned(size)>length-offset)return false;
  const unsigned char*data=bytes+offset;int plr=i32(data);
  if(!Game.Players.Get(plr)||(owner>=0&&plr!=owner))return false;
  switch(type){
   case C4PK_PlayerControl:if(size!=sizeof(C4ControlPlayerControl))return false;break;
   case C4PK_PlayerCommand:if(size!=sizeof(C4ControlPlayerCommand))return false;break;
   case C4PK_SetHostility:if(size!=sizeof(C4ControlSetHostility))return false;break;
   case C4PK_SurrenderPlayer:if(size!=4)return false;break;
   case C4PK_PlayerSelection:{if(size<8)return false;int n=i32(data+4);if(n<0||n>1024||size!=8+4*n)return false;for(int j=0;j<n;++j){C4Object*o=Game.Objects.ObjectPointer(i32(data+8+4*j));if(o&&o->Owner!=plr)return false;}break;}
   default:return false;
  }
  C4Packet p;p.Set(type,(void*)data,size);result.AddStatic(p);offset+=size;
 }
 return offset==length;
}
const void*serialize(C4Control&control){C4Packet wrapper;wrapper.AddStatic(control);output.assign(wrapper.Data,wrapper.Data+wrapper.Size);return output.data();}
bool allowedType(int t){return t==C4PK_PlayerControl||t==C4PK_PlayerCommand||t==C4PK_PlayerSelection||t==C4PK_SetHostility||t==C4PK_SurrenderPlayer;}
}
bool PlanetNetworkEnabled(){return enabled;}
unsigned int PlanetNetworkSeed(unsigned int fallback){return enabled?seed:fallback;}
void PlanetNetworkSelect(){
 if(!enabled||selected||playerNumber(totalPlayers-1)<0)return;
 int number=playerNumber(localSlot);
 for(C4Player*p=Game.Players.First;p;p=p->Next){p->LocalControl=p->Number==number;p->Control=p->LocalControl?C4P_Control_Keyboard1:C4P_Control_None;if(!p->LocalControl){p->MouseControl=FALSE;Game.GraphicsSystem.CloseViewport(p->Number);}}
 selected=true;
}
bool PlanetNetworkExecuteControl(){
 if(!selected||!Game.GameGo||Game.Halt||acceptedFrame!=Game.FrameCounter)return false;
 // Wall-clock time in network mode advances with the shared 28 ms tick stream.
 if((uint64_t(Game.FrameCounter+1)*28/1000)!=(uint64_t(Game.FrameCounter)*28/1000))Game.Sec1Timer();
 incoming.Execute();acceptedFrame=-1;Game.DoControl=FALSE;return true;
}
extern "C" {
EMSCRIPTEN_KEEPALIVE int nc_browser_net_configure(unsigned int randomSeed,int player,int players){
 if(PlanetReady||enabled||player<0||player>=players||players<2||players>12)return -1;
 enabled=true;seed=randomSeed;localSlot=player;totalPlayers=players;return 1;
}
EMSCRIPTEN_KEEPALIVE unsigned nc_browser_net_size(){return output.size();}
EMSCRIPTEN_KEEPALIVE const void*nc_browser_net_drain(){
 output.clear();if(!enabled||!PlanetReady||!selected)return nullptr;
 C4Control outgoing;C4Packet packet;
 for(int i=0;Game.Input.GetStatic(i,packet);++i)if(allowedType(packet.Type)&&packet.Size>=4&&i32(packet.Data)==playerNumber(localSlot))outgoing.AddStatic(packet);
 Game.Input.Clear();if(!outgoing.Size)return nullptr;return serialize(outgoing);
}
EMSCRIPTEN_KEEPALIVE int nc_browser_net_admit(int origin,const void*bytes,unsigned length){
 if(!enabled||localSlot!=0||!selected||origin<0||origin>=totalPlayers||length>MaxInput)return -1;
 C4Control batch;if(!validate((const unsigned char*)bytes,length,playerNumber(origin),batch))return -2;
 if(pending.Size+batch.Size>int(MaxFrame-Header))return -3;
 pending.AddData(batch.Data,batch.Size);return 1;
}
EMSCRIPTEN_KEEPALIVE const void*nc_browser_net_build(int frame){
 output.clear();if(!enabled||!PlanetReady||!selected||localSlot!=0||frame!=Game.FrameCounter||frame==builtFrame||acceptedFrame>=0)return nullptr;
 builtFrame=frame;serialize(pending);pending.Clear();return output.data();
}
EMSCRIPTEN_KEEPALIVE int nc_browser_net_accept(int frame,const void*bytes,unsigned length){
 if(!enabled||!PlanetReady||frame!=Game.FrameCounter||acceptedFrame>=0)return -1;
 C4Control batch;if(!validate((const unsigned char*)bytes,length,-1,batch))return -2;
 incoming.Copy(batch);acceptedFrame=frame;return 1;
}
EMSCRIPTEN_KEEPALIVE const void*nc_browser_net_sync(){
 output.clear();if(!enabled||!PlanetReady)return nullptr;
 C4ControlSyncCheck check;check.Set();check.ControlTime=0;
 output.resize(sizeof(check)+sizeof(PlanetRandomState));memcpy(output.data(),&check,sizeof(check));memcpy(output.data()+sizeof(check),&PlanetRandomState,sizeof(PlanetRandomState));return output.data();
}
EMSCRIPTEN_KEEPALIVE const char*nc_browser_net_status(){
 std::ostringstream s;s<<"{\"enabled\":"<<(enabled?"true":"false")<<",\"running\":"<<(PlanetReady?"true":"false")<<",\"playersJoined\":"<<(selected?"true":"false")<<",\"paused\":"<<(Game.Halt?"true":"false")<<",\"frame\":"<<Game.FrameCounter<<",\"acceptedFrame\":"<<acceptedFrame<<",\"localPlayerIndex\":"<<localSlot<<",\"totalPlayers\":"<<totalPlayers<<",\"seed\":"<<seed<<"}";status=s.str();return status.c_str();
}
}
