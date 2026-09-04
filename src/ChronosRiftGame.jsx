import './game.css';

export default function ChronosRiftGame() {
  return <main className="luoying-host">
    <iframe
      className="luoying-frame"
      src="/luoying-xiantu/index.html"
      title="落樱仙途"
      referrerPolicy="same-origin"
    />
  </main>;
}
