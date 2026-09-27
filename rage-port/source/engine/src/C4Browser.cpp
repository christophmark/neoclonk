/* Browser inspection and automation boundary for the original Clonk Rage engine.
   Scheduling and input only: this file does not implement gameplay or mutate
   terrain, object positions, inventories, materials, scripts, or objectives. */
#include <C4Include.h>
#include <C4Game.h>
#include <C4Object.h>
#include <C4Player.h>
#include <C4Config.h>
#include <C4Random.h>
#include <C4KeyboardInput.h>
#include <C4ObjectMenu.h>
#include <C4Command.h>
#include <C4Control.h>
#include <C4Application.h>
#include <C4Viewport.h>
#include <C4GraphicsSystem.h>
#include <C4MouseControl.h>
#include <C4Gui.h>
#include <C4RoundResults.h>
#include <emscripten/emscripten.h>

namespace {
StdStrBuf BrowserResult;
bool BrowserStepping = false;
double BrowserRequestedZoom = 1.0;

// Original content strings use an 8-bit character set. Escaping bytes outside
// ASCII keeps the inspection payload valid JSON without changing engine text.
void JsonString(StdStrBuf &out, const char *value)
{
  out.AppendChar('"');
  if (value) for (const unsigned char *p = reinterpret_cast<const unsigned char *>(value); *p; ++p)
  {
    if (*p == '"' || *p == '\\') { out.AppendChar('\\'); out.AppendChar(*p); }
    else if (*p < 32 || *p >= 127) out.AppendFormat("\\u%04x", static_cast<unsigned>(*p));
    else out.AppendChar(*p);
  }
  out.AppendChar('"');
}

void ObjectJson(StdStrBuf &out, C4Object *object)
{
  if (!object || !object->Status) { out.Append("null"); return; }
  char id[5]; GetC4IdText(object->id, id);
  out.AppendFormat("{\"number\":%d,\"id\":", object->Number); JsonString(out,id);
  out.Append(",\"name\":"); JsonString(out,object->GetName());
  out.AppendFormat(",\"x\":%d,\"y\":%d,\"fixedX\":%d,\"fixedY\":%d,\"vx\":%d,\"vy\":%d,\"owner\":%d,\"controller\":%d,\"energy\":%d,\"breath\":%d,\"construction\":%d,\"selected\":%s,\"inLiquid\":%s,\"contained\":%d,\"procedure\":%d,\"action\":",
    object->x, object->y, object->fix_x.val, object->fix_y.val,
    object->xdir.val, object->ydir.val, object->Owner, object->Controller,
    object->Energy, object->Breath, object->GetCon(), object->Select?"true":"false",
    object->InLiquid?"true":"false",object->Contained?object->Contained->Number:0,object->GetProcedure());
  JsonString(out, object->Action.Act > ActIdle && object->Def && object->Def->ActMap ? object->Def->ActMap[object->Action.Act].Name : "Idle");
  out.AppendFormat(",\"commandDirection\":%d,\"facing\":%d,\"phase\":%d,\"phaseDelay\":%d,\"actionTime\":%d,\"actionData\":%d,\"contact\":%u,\"attachment\":%d,\"contents\":[",
    object->Action.ComDir,object->Action.Dir,object->Action.Phase,object->Action.PhaseDelay,
    object->Action.Time,object->Action.Data,object->t_contact,object->Action.t_attach);
  bool comma=false;
  for(C4ObjectLink *link=object->Contents.First;link;link=link->Next) if(link->Obj && link->Obj->Status)
  { if(comma)out.AppendChar(','); comma=true; out.AppendFormat("%d",link->Obj->Number); }
  out.Append("],\"menu\":");
  if (object->Menu && object->Menu->IsActive()) {
    out.AppendFormat("{\"id\":%d,\"selected\":%d,\"items\":[",object->Menu->GetIdentification(),object->Menu->GetSelection());
    for (int i=0;i<object->Menu->GetItemCount();++i) {
      if(i)out.AppendChar(',');
      char itemId[5]; GetC4IdText(object->Menu->GetItem(i)->GetC4ID(),itemId); JsonString(out,itemId);
    }
    C4Rect bounds=object->Menu->GetBounds();
    out.AppendFormat("],\"bounds\":{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d}}",bounds.x,bounds.y,bounds.Wdt,bounds.Hgt);
  } else out.Append("null");
  out.Append(",\"commands\":[");
  bool commandComma=false;
  for(C4Command *command=object->Command;command;command=command->Next)
  {
    if(commandComma)out.AppendChar(',');commandComma=true;
    out.AppendFormat("{\"id\":%d,\"name\":",command->Command);JsonString(out,CommandName(command->Command));
    out.AppendFormat(",\"x\":%d,\"y\":%d,\"target\":%d,\"target2\":%d,\"data\":%d,\"finished\":%s,\"failures\":%d}",
      command->Tx._getInt(),command->Ty,command->Target?command->Target->Number:0,
      command->Target2?command->Target2->Number:0,command->Data,command->Finished?"true":"false",command->Failures);
  }
  out.Append("]}");
}

int MaterialCount(int material, bool effective)
{
  if(material < 0 || material >= Game.Material.Num) return -1;
  return static_cast<int>(effective && Game.Material.Map[material].MinHeightCount ? Game.Landscape.EffectiveMatCount[material] : Game.Landscape.MatCount[material]);
}
}

extern "C" {

// Presentation only: browser dimensions and touch occlusion are CSS pixels.
// Simulation coordinates, materials and object state are never changed here.
EMSCRIPTEN_KEEPALIVE int nc_browser_view(int width,int height,double zoom,int ox,int oy,int ow,int oh)
{
  if(!Game.IsRunning || !lpDDraw || width<240 || height<160 || width>4096 || height>4096 ||
     !(zoom>=0.5 && zoom<=8.0) || ow<0 || oh<0)return -1;
  if((Config.Graphics.ResX!=width || Config.Graphics.ResY!=height) && !Application.SetResolution(width,height))return -2;
  Game.GraphicsSystem.RecalculateViewports();
  C4Rect occlusion(ox,oy,ow,oh);
  BrowserRequestedZoom=zoom;
  for(C4Viewport *view=Game.GraphicsSystem.GetFirstViewport();view;view=view->GetNext())
    view->SetBrowserView(static_cast<float>(zoom),occlusion);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char *nc_browser_state()
{
  BrowserResult.Format("{\"running\":%s,\"paused\":%s,\"frame\":%d,\"gameOver\":%s,\"evaluated\":%s,\"scenario\":",
    Game.IsRunning?"true":"false",Game.IsPaused()?"true":"false",Game.FrameCounter,
    Game.GameOver?"true":"false",Game.Evaluated?"true":"false");
  JsonString(BrowserResult,Game.ScenarioFilename);
  BrowserResult.AppendFormat(",\"randomHold\":%u,\"randomCount\":%d,\"landscape\":{\"width\":%d,\"height\":%d,\"mapWidth\":%d,\"mapHeight\":%d,\"mapZoom\":%d},\"weather\":{\"wind\":%d,\"temperature\":%d,\"season\":%d},\"materials\":[",
    RandomHold,RandomCount,Game.Landscape.Width,Game.Landscape.Height,
    Game.Landscape.MapWidth,Game.Landscape.MapHeight,Game.Landscape.MapZoom,
    Game.Weather.Wind,Game.Weather.Temperature,Game.Weather.Season);
  if(Game.IsRunning) for(int i=0;i<Game.Material.Num;++i)
  {
    if(i) BrowserResult.AppendChar(',');
    BrowserResult.AppendFormat("{\"index\":%d,\"name\":",i); JsonString(BrowserResult,Game.Material.Map[i].Name);
    BrowserResult.AppendFormat(",\"pixels\":%d,\"effectivePixels\":%d}",MaterialCount(i,false),MaterialCount(i,true));
  }
  BrowserResult.AppendFormat("],\"goldObjects\":%d,\"objectCount\":%d,\"players\":[",
    Game.IsRunning?Game.Objects.ObjectCount(C4ID_Gold):0,Game.IsRunning?Game.Objects.ObjectCount():0);
  bool comma=false;
  if(Game.IsRunning) for(C4Player *player=Game.Players.First;player;player=player->Next)
  {
    if(comma)BrowserResult.AppendChar(',');comma=true;
    BrowserResult.AppendFormat("{\"number\":%d,\"name\":",player->Number);JsonString(BrowserResult,player->Name.getData());
    BrowserResult.AppendFormat(",\"local\":%s,\"eliminated\":%s,\"controlStyle\":%d,\"keyboardSet\":%d,\"wealth\":%d,\"lastCommand\":%d,\"commandDelay\":%d,\"pressedCommands\":%d,\"menu\":%s,\"cursor\":",
      player->LocalControl?"true":"false",player->Eliminated?"true":"false",player->ControlStyle,
      player->Control,player->Wealth,player->LastCom,player->LastComDelay,player->PressedComs,
      player->Menu.IsActive()?"true":"false");
    ObjectJson(BrowserResult,player->Cursor);BrowserResult.Append(",\"crew\":[");
    bool crewComma=false;
    for(C4ObjectLink *link=player->Crew.First;link;link=link->Next) if(link->Obj && link->Obj->Status)
    {if(crewComma)BrowserResult.AppendChar(',');crewComma=true;ObjectJson(BrowserResult,link->Obj);}
    BrowserResult.Append("]}");
  }
  BrowserResult.AppendFormat("],\"mouse\":{\"active\":%s,\"player\":%d,\"screenX\":%d,\"screenY\":%d,\"worldX\":%d,\"worldY\":%d},\"viewport\":",
    Game.MouseControl.IsActive()?"true":"false",Game.MouseControl.GetPlayer(),Game.MouseControl.BrowserScreenX(),Game.MouseControl.BrowserScreenY(),Game.MouseControl.BrowserWorldX(),Game.MouseControl.BrowserWorldY());
  C4Viewport *view=Game.GraphicsSystem.GetFirstViewport();
  if(!view)BrowserResult.Append("null");
  else {
    C4Rect rect=view->GetOutputRect();
    C4Player *player=Game.Players.Get(view->GetPlayer());
    C4Object *cursor=player?player->Cursor:NULL;
    BrowserResult.AppendFormat("{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,\"worldX\":%d,\"worldY\":%d,\"worldWidth\":%d,\"worldHeight\":%d,\"zoom\":%.4f,\"requestedZoom\":%.4f,\"minZoom\":%.4f,\"headerHeight\":%d,\"clonkScreenX\":%d,\"clonkScreenY\":%d,\"occlusion\":{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d}}",
      rect.x,rect.y,rect.Wdt,rect.Hgt,view->ViewX,view->ViewY,view->BrowserWorldWidth(),view->BrowserWorldHeight(),
      static_cast<double>(view->BrowserZoom),BrowserRequestedZoom,Max(0.5,Max(double(rect.Wdt)/Max(1,Game.Landscape.Width),double(rect.Hgt)/Max(1,Game.Landscape.Height))),
      C4UpperBoardHeight,cursor?view->BrowserScreenX(cursor->x):-1,cursor?view->BrowserScreenY(cursor->y):-1,
      view->BrowserOcclusion.x,view->BrowserOcclusion.y,view->BrowserOcclusion.Wdt,view->BrowserOcclusion.Hgt);
  }
  BrowserResult.Append("}");return BrowserResult.getData();
}


// Lifecycle calls run after the initiating JS call returns, like original Save.
EMSCRIPTEN_KEEPALIVE int nc_browser_quit()
{
  if(!Game.IsRunning)return -1;
  emscripten_async_call([](void *) { if(Game.IsRunning)Game.Abort(true); },NULL,0);
  return 1;
}

// Original full-landscape screenshot path, useful for scenario gallery QA.
EMSCRIPTEN_KEEPALIVE int nc_browser_overview()
{
  if(!Game.IsRunning)return -1;
  return Game.GraphicsSystem.SaveScreenshot(true)?1:0;
}

// Native GUI geometry for pointer acceptance tests; no selection or command calls.
EMSCRIPTEN_KEEPALIVE const char *nc_browser_menus()
{
  BrowserResult.Copy("[");bool comma=false;
  for(C4Player *p=Game.Players.First;p;p=p->Next) {
    C4Menu *menus[2]={&p->Menu,p->Cursor?p->Cursor->Menu:NULL};
    for(int kind=0;kind<2;++kind) {
      C4Menu *menu=menus[kind];if(!menu || !menu->IsActive())continue;
      C4Viewport *view=Game.GraphicsSystem.GetViewport(p->Number);if(!view)continue;
      C4Rect viewport=view->GetOutputRect(),r=menu->GetBounds();
      if(comma)BrowserResult.AppendChar(',');comma=true;
      BrowserResult.AppendFormat("{\"player\":%d,\"objectMenu\":%s,\"id\":%d,\"selected\":%d,\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,\"items\":[",p->Number,kind?"true":"false",menu->GetIdentification(),menu->GetSelection(),viewport.x+r.x,viewport.y+r.y,r.Wdt,r.Hgt);
      for(int i=0;i<menu->GetItemCount();++i) {
        if(i)BrowserResult.AppendChar(',');C4MenuItem *item=menu->GetItem(i);C4Rect ir=item->GetBounds();int x=0,y=0;item->ClientPos2ScreenPos(x,y);char id[5];GetC4IdText(item->GetC4ID(),id);
        BrowserResult.AppendFormat("{\"index\":%d,\"id\":",i);JsonString(BrowserResult,id);
        BrowserResult.AppendFormat(",\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d}",x,y,ir.Wdt,ir.Hgt);
      }
      BrowserResult.Append("]}");
    }
  }
  BrowserResult.AppendChar(']');return BrowserResult.getData();
}

EMSCRIPTEN_KEEPALIVE const char *nc_browser_diagnostics()
{
  BrowserResult.Format("{\"running\":%s,\"minPlayers\":%d,\"maxPlayers\":%d,\"randomSeed\":%u,\"definitionCount\":%d,\"definitionModules\":",
    Game.IsRunning?"true":"false",Game.C4S.Head.MinPlayer,Game.Parameters.MaxPlayers,static_cast<unsigned>(Game.Parameters.RandomSeed),Game.Defs.GetDefCount());
  JsonString(BrowserResult,Game.DefinitionFilenames);
  BrowserResult.AppendFormat(",\"mouseOwned\":%s,\"players\":[",Game.MouseControl.IsMouseOwned()?"true":"false");
  bool comma=false;
  for(C4Player *p=Game.Players.First;p;p=p->Next) {
    if(comma)BrowserResult.AppendChar(',');comma=true;
    BrowserResult.AppendFormat("{\"number\":%d,\"team\":%d,\"client\":%d,\"status\":%d,\"local\":%s,\"mouse\":%s,\"profile\":",p->Number,p->Team,p->AtClient,p->Status,p->LocalControl?"true":"false",p->MouseControl?"true":"false");
    JsonString(BrowserResult,p->Filename);BrowserResult.Append(",\"keys\":[");
    if(p->Control>=C4P_Control_Keyboard1 && p->Control<=C4P_Control_Keyboard4)
      for(int k=0;k<C4MaxKey;++k){if(k)BrowserResult.AppendChar(',');JsonString(BrowserResult,C4KeyCodeEx::KeyCode2String(Config.Controls.Keyboard[p->Control][k],true,false).getData());}
    BrowserResult.Append("]}");
  }
  BrowserResult.Append("],\"viewports\":[");comma=false;
  for(C4Viewport *v=Game.GraphicsSystem.GetFirstViewport();v;v=v->GetNext()) {
    if(comma)BrowserResult.AppendChar(',');comma=true;C4Rect r=v->GetOutputRect();
    BrowserResult.AppendFormat("{\"player\":%d,\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,\"worldX\":%d,\"worldY\":%d,\"zoom\":%.4f}",v->GetPlayer(),r.x,r.y,r.Wdt,r.Hgt,v->ViewX,v->ViewY,static_cast<double>(v->BrowserZoom));
  }
  BrowserResult.Append("],\"dialog\":");
  C4GUI::Dialog *dialog=Game.pGUI?Game.pGUI->GetTopDialog():NULL;
  if(dialog){C4Rect r=dialog->GetBounds();BrowserResult.Append("{\"id\":");JsonString(BrowserResult,dialog->GetID());BrowserResult.AppendFormat(",\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d}",r.x,r.y,r.Wdt,r.Hgt);}else BrowserResult.Append("null");
  BrowserResult.Append(" ,\"goals\":[");comma=false;
  for(C4ObjectLink *link=Game.Objects.First;link;link=link->Next) {
    C4Object *o=link->Obj;if(!o || !o->Status || !(o->Category&C4D_Goal))continue;
    if(comma)BrowserResult.AppendChar(',');comma=true;char id[5];GetC4IdText(o->id,id);
    BrowserResult.Append("{\"id\":");JsonString(BrowserResult,id);BrowserResult.Append(",\"name\":");JsonString(BrowserResult,o->GetName());
    BrowserResult.Append(",\"description\":");JsonString(BrowserResult,o->Def?o->Def->GetDesc():NULL);
    BrowserResult.AppendFormat(",\"fulfilled\":%s}",Game.Evaluated?(Game.RoundResults.GetFulfilledGoals().GetIDCount(o->id)?"true":"false"):"null");
  }
  BrowserResult.Append("]}");return BrowserResult.getData();
}
EMSCRIPTEN_KEEPALIVE const char *nc_browser_object(int number)
{
  BrowserResult.Clear();ObjectJson(BrowserResult,Game.IsRunning?Game.Objects.SafeObjectPointer(number):NULL);
  return BrowserResult.getData();
}

// radius=0 lists all live objects; otherwise restrict by distance to the supplied center.
EMSCRIPTEN_KEEPALIVE const char *nc_browser_objects(int x,int y,int radius)
{
  BrowserResult.Copy("[");bool comma=false;
  if(Game.IsRunning && radius>=0) for(C4ObjectLink *link=Game.Objects.First;link;link=link->Next)
  {
    C4Object *object=link->Obj;if(!object || !object->Status)continue;
    const int64_t dx=static_cast<int64_t>(object->x)-x,dy=static_cast<int64_t>(object->y)-y;
    if(radius && (dx>radius || dx<-static_cast<int64_t>(radius) || dy>radius || dy<-static_cast<int64_t>(radius)))continue;
    if(radius && dx*dx>static_cast<int64_t>(radius)*radius-dy*dy)continue;
    if(comma)BrowserResult.AppendChar(',');comma=true;ObjectJson(BrowserResult,object);
  }
  BrowserResult.AppendChar(']');return BrowserResult.getData();
}

EMSCRIPTEN_KEEPALIVE int nc_browser_material(int x,int y)
{
  if(!Game.IsRunning || x<0 || y<0 || x>=Game.Landscape.Width || y>=Game.Landscape.Height)return -1;
  return Game.Landscape.GetMat(x,y);
}

// Read-only material grid, row-major, bounded to a million cells per call.
EMSCRIPTEN_KEEPALIVE const char *nc_browser_terrain(int x,int y,int width,int height)
{
  if(!Game.IsRunning || x<0 || y<0 || width<1 || height<1 ||
     static_cast<int64_t>(x)+width>Game.Landscape.Width ||
     static_cast<int64_t>(y)+height>Game.Landscape.Height ||
     static_cast<int64_t>(width)*height>1048576)
  {BrowserResult.Copy("{\"error\":\"Invalid or unavailable terrain rectangle\"}");return BrowserResult.getData();}
  BrowserResult.Format("{\"frame\":%d,\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d,\"materials\":[",Game.FrameCounter,x,y,width,height);
  bool comma=false;
  for(int row=0;row<height;++row)for(int column=0;column<width;++column)
  {if(comma)BrowserResult.AppendChar(',');comma=true;BrowserResult.AppendFormat("%d",Game.Landscape.GetMat(x+column,y+row));}
  BrowserResult.Append("]}");return BrowserResult.getData();
}

// FNV-1a over original texture/IFT bytes, for before/after and parity checks.
EMSCRIPTEN_KEEPALIVE unsigned nc_browser_landscape_hash()
{
  if(!Game.IsRunning)return 0;
  uint32_t hash=2166136261u;
  for(int y=0;y<Game.Landscape.Height;++y)for(int x=0;x<Game.Landscape.Width;++x)
    hash=(hash^Game.Landscape.GetPix(x,y))*16777619u;
  return hash;
}

// keyCode is the original SDL1.2 key value. modifiers: 1=alt, 2=ctrl, 4=shift.
EMSCRIPTEN_KEEPALIVE int nc_browser_key(int keyCode,int pressed,int modifiers,int repeated)
{
  if(!Game.IsRunning || BrowserStepping)return -1;
  return Game.DoKeyboardInput(keyCode,pressed?KEYEV_Down:KEYEV_Up,
    !!(modifiers&1),!!(modifiers&2),!!(modifiers&4),!!repeated)?1:0;
}

// Routes a configured control key through the same original keyboard dispatcher.
// Indices 0..8 are the nine classic controls; 9..11 are menu/special keys.
EMSCRIPTEN_KEEPALIVE int nc_browser_control(int playerNumber,int control,int pressed,int repeated)
{
  if(!Game.IsRunning || BrowserStepping || control<0 || control>=C4MaxKey)return -1;
  C4Player *player=Game.Players.Get(playerNumber);
  if(!player || !player->LocalControl || player->Eliminated)return -2;
  if(player->Control<C4P_Control_Keyboard1 || player->Control>C4P_Control_Keyboard4)return -3;
  return nc_browser_key(Config.Controls.Keyboard[player->Control][control],pressed,0,repeated);
}

// Original mouse-control packet path. Only ordinary player commands are exposed.
// append=0 replaces the selected crew command stack; append=1 appends normally.
EMSCRIPTEN_KEEPALIVE int nc_browser_command(int playerNumber,int command,int targetNumber,
                                           int x,int y,int target2Number,int data,int append)
{
  if(!Game.IsRunning || BrowserStepping || Game.Network.isEnabled())return -1;
  C4Player *player=Game.Players.Get(playerNumber);
  if(!player || !player->LocalControl || player->Eliminated)return -2;
  switch(command)
  {
    case C4CMD_Follow: case C4CMD_MoveTo: case C4CMD_Enter: case C4CMD_Exit:
    case C4CMD_Grab: case C4CMD_Build: case C4CMD_Throw: case C4CMD_Chop:
    case C4CMD_UnGrab: case C4CMD_Jump: case C4CMD_Wait: case C4CMD_Get:
    case C4CMD_Put: case C4CMD_Drop: case C4CMD_Dig: case C4CMD_Activate:
    case C4CMD_PushTo: case C4CMD_Construct: case C4CMD_Buy: case C4CMD_Sell:
    case C4CMD_Home: case C4CMD_Take: case C4CMD_Take2: break;
    default: return -3;
  }
  if(append!=0 && append!=1)return -3;
  C4Object *target=targetNumber?Game.Objects.SafeObjectPointer(targetNumber):NULL;
  C4Object *target2=target2Number?Game.Objects.SafeObjectPointer(target2Number):NULL;
  if((targetNumber && !target) || (target2Number && !target2))return -4;
  Game.Input.Add(CID_PlrCommand,new C4ControlPlayerCommand(playerNumber,command,x,y,
    target,target2,data,append?C4P_Command_Append:C4P_Command_Set));
  return 1;
}

EMSCRIPTEN_KEEPALIVE int nc_browser_pause(int paused)
{
  if(!Game.IsRunning || BrowserStepping || Game.Network.isEnabled())return -1;
  if(!paused && Game.HaltCount>1)return -2;
  if(paused && !Game.IsPaused())Game.Pause();
  if(!paused && Game.IsPaused())Game.Unpause();
  return Game.IsPaused()?1:0;
}

// Runs the complete original tick, including control queue, objects, materials,
// scripts and goals. Never bypass an initialization/multiple-halt or network pause.
EMSCRIPTEN_KEEPALIVE int nc_browser_step(int ticks)
{
  if(ticks<1 || ticks>512)return -1;
  if(!Game.IsRunning || Game.GameOver || Game.Network.isEnabled() || BrowserStepping)return -2;
  if(!Game.IsPaused() || Game.HaltCount!=1)return -3;
  struct StepGuard {
    StepGuard(){BrowserStepping=true;Game.Unpause();}
    ~StepGuard(){if(Game.IsRunning)Game.Pause();BrowserStepping=false;}
  } guard;
  const int before=Game.FrameCounter;
  for(int i=0;i<ticks && Game.IsRunning && !Game.GameOver;++i)
  {
    const int frame=Game.FrameCounter;Game.Execute();
    if(Game.FrameCounter==frame)break; // Original control preparation may defer a tick.
  }
  return Game.FrameCounter-before;
}
}
