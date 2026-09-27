/** The game itself is the original C++ engine, compiled to WebAssembly. */
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = (await searchParams) ?? {};
  const query = new URLSearchParams();
  query.set('v', 'original-interface-6');
  for (const key of ['debug', 'touch', 'replay']) {
    if (values[key] === '1') query.set(key, '1');
  }
  const save = values.save;
  if (typeof save === 'string' && /\.c4s$/i.test(save) &&
    save.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\\0]/.test(part))) query.set('save', save);
  return <main className="original-game">
    <iframe title="Neoclonk — original Clonk Rage Gold Mine"
      src={`/rage/index.html${query.size ? `?${query}` : ''}`}
      allow="fullscreen; autoplay; gamepad" allowFullScreen />
  </main>;
}
