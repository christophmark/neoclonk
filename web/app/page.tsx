/** The game itself is the original C++ engine, compiled to WebAssembly. */
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = (await searchParams) ?? {};
  const query = new URLSearchParams();
  query.set('v', 'zoom-buttons-1');
  for (const key of ['debug', 'touch', 'replay', 'play', 'solo', 'load', 'host', 'join']) {
    if (values[key] === '1') query.set(key, '1');
  }
  const scenario = values.scenario;
  const room = values.room;
  if (typeof room === 'string' && /^[A-Z2-9]{8}$/i.test(room)) query.set('room', room.toUpperCase());
  if (typeof scenario === 'string' && /^[a-z0-9_./-]+$/i.test(scenario)) query.set('scenario', scenario);
  const save = values.save;
  if (typeof save === 'string' && /\.c4s$/i.test(save) &&
    save.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\\0]/.test(part))) query.set('save', save);
  return <main className="original-game">
    <iframe title="Neoclonk — original Clonk Rage scenarios"
      src={`/rage/index.html${query.size ? `?${query}` : ''}`}
      allow="fullscreen; autoplay; gamepad" allowFullScreen />
  </main>;
}
