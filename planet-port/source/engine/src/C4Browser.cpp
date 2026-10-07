#include <C4Include.h>
#include <emscripten.h>
#include <sstream>
#include <string>
unsigned int PlanetRandomState = 1;
bool PlanetReady = false;
double PlanetBrowserZoom = 1.0;
int PlanetTouchX=0,PlanetTouchY=0,PlanetTouchW=0,PlanetTouchH=0;
extern "C" int PlanetResizeRender(int,int,int,int);
static std::string BrowserState;
static std::string JsonText(const char* value) {
  std::string out = "\"";
  for (const unsigned char *p = (const unsigned char*)value; p && *p; ++p) {
    if (*p == '"' || *p == '\\') out += '\\';
    if (*p >= 32 && *p < 127) out += char(*p);
    else out += '?';
  }
  return out + "\"";
}
static void ObjectJson(std::ostringstream &s, C4Object *o) {
  if (!o) { s << "null"; return; }
  s << "{\"number\":" << o->Number << ",\"x\":" << o->x << ",\"y\":" << o->y
    << ",\"action\":" << o->Action.Act << ",\"commandDirection\":" << o->Action.ComDir << ",\"energy\":" << o->Energy
    << ",\"rank\":" << (o->Info ? o->Info->Rank : -1)
    << ",\"experience\":" << (o->Info ? o->Info->Experience : 0)
    << ",\"canScale\":" << (o->GetPhysical()->CanScale ? "true" : "false")
    << ",\"canHangle\":" << (o->GetPhysical()->CanHangle ? "true" : "false") << "}";
}
extern "C" {
// Read the same compiled command metadata as the original action HUD. Never
// call scenario scripts here: UI polling must not change the simulation or RNG.
EMSCRIPTEN_KEEPALIVE const char *nc_browser_touch() {
  std::ostringstream s;
  C4Player *p=Game.Players.First;
  while(p && (!p->LocalControl || p->Eliminated))p=p->Next;
  if(!p){BrowserState="null";return BrowserState.c_str();}
  C4Object *o=p->Cursor;int crew=0;
  for(C4ObjectLink *l=p->Crew.First;l;l=l->Next)if(l->Obj && l->Obj->Status)++crew;
  s<<"{\"player\":"<<p->Number<<",\"cursor\":"<<(o?o->Number:0)
   <<",\"crewCount\":"<<crew<<",\"menu\":"<<((p->Menu.IsActive() || (o && o->Menu && o->Menu->IsActive()))?"true":"false")<<",\"digging\":"<<((o && o->GetProcedure()==DFA_DIG)?"true":"false")<<",\"extras\":[";
  bool comma=false;
  if(o && o->Status && o->Def)for(int key=0;key<2;++key){
    bool started=false;
    for(int variant=0;variant<3;++variant){
      int order=6+key+8*variant;
      if(!(o->Def->ControlFlag & (1<<order)))continue;
      if(!started){if(comma)s<<',';comma=true;s<<"{\"control\":"<<(10+key)<<",\"variants\":[";started=true;}else s<<',';
      const char *desc=o->Def->Script.GetControlDesc(PSF_Control,ComOrder(order));
      s<<"{\"gesture\":"<<JsonText(variant==2?"double":variant==1?"single":"press")<<",\"label\":"<<JsonText(desc?desc:"")<<"}";
    }
    if(started)s<<"]}";
  }
  s<<"]}";BrowserState=s.str();return BrowserState.c_str();
}
EMSCRIPTEN_KEEPALIVE const char *nc_browser_state() {
  std::ostringstream s;
  s << "{\"engine\":\"planet-4.65\",\"ready\":" << (PlanetReady?"true":"false") << ",\"running\":" << (Game.Landscape.Width>0 ? "true":"false")
    << ",\"frame\":" << Game.FrameCounter << ",\"paused\":" << (Game.Halt?"true":"false")
    << ",\"gameOver\":" << (Game.GameOver?"true":"false") << ",\"scenario\":" << JsonText(Game.ScenarioFilename)
    << ",\"randomHold\":" << PlanetRandomState << ",\"randomCount\":" << RandomCount
    << ",\"landscape\":{\"width\":" << Game.Landscape.Width << ",\"height\":" << Game.Landscape.Height << "},\"players\":[";
  bool comma = false;
  for (C4Player *p=Game.Players.First;p;p=p->Next) {
    if (comma) s << ','; comma=true;
    s << "{\"number\":"<<p->Number<<",\"name\":"<<JsonText(p->Name)<<",\"local\":"<<(p->LocalControl?"true":"false")
      <<",\"eliminated\":"<<(p->Eliminated?"true":"false")<<",\"wealth\":"<<p->Wealth<<",\"lastCommand\":"<<p->LastCom<<",\"cursor\":";
    ObjectJson(s,p->Cursor);s<<",\"crew\":[";bool cc=false;
    for(C4ObjectLink*l=p->Crew.First;l;l=l->Next)if(l->Obj&&l->Obj->Status){if(cc)s<<',';cc=true;ObjectJson(s,l->Obj);}s<<"]}";
  }
  s << "],\"viewport\":{\"width\":"<<Config.Graphics.ResX<<",\"height\":"<<Config.Graphics.ResY<<",\"zoom\":"<<PlanetBrowserZoom<<"}}"; BrowserState=s.str();return BrowserState.c_str();
}
EMSCRIPTEN_KEEPALIVE int nc_browser_control(int player,int control,int pressed,int repeated) {
  if(control<0||control>=C4MaxKey)return -1;
  C4Player*p=Game.Players.Get(player);if(!p||!p->LocalControl||p->Eliminated)return -2;
  if(pressed)Game.LocalPlayerControl(player,Control2Com(control));
  return 1;
}
EMSCRIPTEN_KEEPALIVE int nc_browser_key(int key,int pressed,int modifiers,int repeated) {
  if(pressed)Game.KeyboardInput(key,modifiers&4);return 1;
}
EMSCRIPTEN_KEEPALIVE int nc_browser_pause(int paused) {Game.Halt=paused!=0;return 1;}
EMSCRIPTEN_KEEPALIVE int nc_browser_rng_seed(unsigned int seed) {FixedRandom(seed);return 1;}
EMSCRIPTEN_KEEPALIVE int nc_browser_rng_next(int range) {return Random(range);}
EMSCRIPTEN_KEEPALIVE const char *nc_planet_state() { return nc_browser_state(); }
EMSCRIPTEN_KEEPALIVE int nc_planet_control(int player,int control,int pressed,int repeated) { return nc_browser_control(player,control,pressed,repeated); }
EMSCRIPTEN_KEEPALIVE int nc_planet_pause(int paused) { return nc_browser_pause(paused); }
EMSCRIPTEN_KEEPALIVE int nc_planet_save() {
  if(Game.Landscape.Width<=0)return 0;
  const char *target="/data/BrowserSave.c4s";
  if(SEqualNoCase(Game.ScenarioFilename,target))return -1;
  if(FileExists(target)&&!EraseItem(target))return -2;
  if(!C4Group_CopyItem(Game.ScenarioFilename,target))return -3;
  C4Group output;
  if(!output.Open(target))return -4;
  if(!Game.Save(output,TRUE,FALSE)){output.Close();return -5;}
  output.Sort(C4FLS_Scenario);
  return output.Close()?1:-6;
}
EMSCRIPTEN_KEEPALIVE int nc_planet_exit() { Game.Halt=TRUE;PlanetReady=false;emscripten_cancel_main_loop();return 1; }

EMSCRIPTEN_KEEPALIVE int nc_planet_view(int width,int height,double zoom,int tx,int ty,int tw,int th) {
  if(width<100||height<100||width>4096||height>4096||!std::isfinite(zoom)||zoom<0.25||zoom>8)return -1;
  PlanetBrowserZoom=zoom;
  PlanetTouchX=int(tx/zoom);PlanetTouchY=int(ty/zoom);PlanetTouchW=int(tw/zoom);PlanetTouchH=int(th/zoom);
  return PlanetResizeRender(width,height,BoundBy(int(width/zoom),1,4096),BoundBy(int(height/zoom),1,4096));
}
EMSCRIPTEN_KEEPALIVE int nc_planet_step(int ticks) {
  if(!PlanetReady||ticks<0||ticks>10000)return -1;
  BOOL halted=Game.Halt;Game.Halt=FALSE;
  int before=Game.FrameCounter;
  for(int i=0;i<ticks&&!Game.GameOver;++i){Game.GameGo=TRUE;Game.Execute();}
  Game.Halt=halted;Game.GraphicsSystem.Execute();return Game.FrameCounter-before;
}

}
