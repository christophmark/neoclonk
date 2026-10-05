/* Copyright (C) 1998-2000  Matthes Bender  RedWolf Design */

/* Some wrappers to runtime-library random */

extern int RandomCount;
extern unsigned int PlanetRandomState;
// Reproduce the original Win32 CRT stream. Host libc rand() is platform-specific.
inline void PlanetSrand(unsigned int seed) { PlanetRandomState = seed; }
inline int PlanetRand() {
  PlanetRandomState = PlanetRandomState * 214013u + 2531011u;
  return (PlanetRandomState >> 16) & 0x7fff;
}

inline void Randomize() {
  PlanetSrand((unsigned)time(NULL));
  RandomCount = 0;
}

inline void FixedRandom(DWORD dwSeed) {
  PlanetSrand(dwSeed);
  RandomCount = 0;
}

inline int Random(int iRange) {
  RandomCount++;
  if (iRange == 0)
    return 0;
  return (PlanetRand() % iRange);
}
