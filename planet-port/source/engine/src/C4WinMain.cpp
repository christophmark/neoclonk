/* Copyright (C) 1998-2000  Matthes Bender  RedWolf Design */

/* Main program entry point */

#include <C4Include.h>
#include <string>
#include <unistd.h>

C4Application Application;
C4Engine Engine;
C4Console Console;
C4FullScreen FullScreen;
C4Game Game;

#ifdef C4SHAREWARE
C4ConfigShareware Config;
#else
C4Config Config;
#endif

int main(int argc, char **argv) {
  chdir("/data");
  setenv("CLONK_CONFIG", "/data/clonk.ini", 1);
  HINSTANCE hInst = 0;
  int nCmdShow = 1;
  std::string cmdLine;
  for (int i = 1; i < argc; i++) {
    if (i > 1)
      cmdLine += " ";
    std::string arg = argv[i];
    // ParseCommandLine understands double-quoted paths, including spaces and UTF-8.
    // A quote cannot occur in original Windows scenario names.
    if (arg.find('"') != std::string::npos) {
      fprintf(stderr, "Planet argument contains an unsupported quote\n");
      return C4XRV_Failure;
    }
    cmdLine += "\"" + arg + "\"";
  }

  // Init application
  if (!Application.Init(hInst, nCmdShow, (char *)cmdLine.c_str()))
    return C4XRV_Failure;

  extern bool PlanetReady; PlanetReady=true;
  extern void PlanetNetworkSelect();PlanetNetworkSelect();

  // Execute application
  Application.Run();

  // Clean up resources before exiting (prevents AddressSanitizer/LeakSanitizer leak reports)
  FullScreen.Clear();
  Application.Clear();

  // Return exit code
  if (!Game.GameOver)
    return C4XRV_Aborted;
  return C4XRV_Completed;
}
