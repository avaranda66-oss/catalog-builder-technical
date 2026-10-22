import React from 'react';
import { photoLinkText, type PhotoLink } from '../photo-matching';

/** Up to this many products are offered as buttons (one click); more than that go in a list to choose from. */
export const MAX_PHOTO_BUTTONS = 6;

interface Props {
  readonly fileName: string;
  readonly link: PhotoLink | undefined;
  /** The person's choice; `undefined` goes back to what the file name says. */
  readonly onChoose: (code: string | undefined) => void;
}

function Choices({ fileName, candidates, current, onPick }: {
  readonly fileName: string;
  readonly candidates: readonly string[];
  readonly current?: string;
  readonly onPick: (code: string) => void;
}) {
  if (candidates.length > MAX_PHOTO_BUTTONS) {
    return (
      <select className="ai-intake-photo-select" aria-label={`Produto da foto ${fileName}`} value={current ?? ''}
        onChange={(event) => { if (event.target.value) onPick(event.target.value); }}>
        <option value="">Escolha o produto…</option>
        {candidates.map((code) => <option key={code} value={code}>{code}</option>)}
      </select>
    );
  }
  return (
    <span className="ai-intake-photo-choices" role="group" aria-label={`Produto da foto ${fileName}`}>
      {candidates.map((code) => (
        <button key={code} type="button" className="ai-intake-photo-choice" aria-pressed={code === current}
          aria-label={`Ligar a foto ${fileName} ao produto ${code}`} onClick={() => onPick(code)}>{code}</button>
      ))}
    </span>
  );
}

/**
 * FR-71: under a photo in the file list, "Foto ligada a: TA-25N" with a change button, or, when the file name does not
 * say (or says two products), the question with one button per product. The person's choice always wins.
 */
export function PhotoLinkLine({ fileName, link, onChoose }: Props) {
  const [changing, setChanging] = React.useState(false);
  const changeButton = React.useRef<HTMLButtonElement>(null);
  // The buttons the person just used disappear: the keyboard goes to "Trocar", which is always there afterwards.
  const focusChange = React.useRef(false);
  React.useEffect(() => {
    if (focusChange.current && changeButton.current) {
      focusChange.current = false;
      changeButton.current.focus();
    }
  });
  if (!link) return null;
  const choose = (code: string | undefined) => { focusChange.current = true; onChoose(code); setChanging(false); };
  if (link.state === 'ask') {
    return (
      <div className="ai-intake-photo-link" data-photo-link="ask">
        <p>{photoLinkText(link)}</p>
        {link.candidates.length > 0 && <Choices fileName={fileName} candidates={link.candidates} onPick={choose} />}
      </div>
    );
  }
  return (
    <div className="ai-intake-photo-link" data-photo-link="linked">
      <p>
        {photoLinkText(link)}
        <button ref={changeButton} type="button" className="ai-intake-link" aria-expanded={changing}
          aria-label={changing ? `Fechar a escolha do produto da foto ${fileName}` : `Trocar o produto da foto ${fileName}`} onClick={() => { focusChange.current = true; setChanging((open) => !open); }}>
          {changing ? 'Fechar' : 'Trocar'}
        </button>
      </p>
      {changing && (
        <>
          <Choices fileName={fileName} candidates={link.candidates} current={link.code} onPick={choose} />
          {link.by === 'person' && (
            <button type="button" className="ai-intake-link" onClick={() => choose(undefined)}>
              Usar o que o nome do arquivo diz
            </button>
          )}
        </>
      )}
    </div>
  );
}
