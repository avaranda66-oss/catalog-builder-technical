// Story: docs/stories/2026-10-17-father-ready-continuacao.md (AC3–AC5).
// Real Chromium geometry only: no Range/DOMRect/measurement replacement.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { plainRichText } from '@/vnext/domain/editorial-model';
import { pxToQ } from '@/vnext/domain/physical';
import { intrinsicMetrics, textFlowRecords } from '@/vnext/rendering/measurement';
import { RichTextRenderer } from '@/vnext/rendering/RichTextRenderer';

const cases = [
  { id: 'hanging', label: 'Espaço pendurado: AAAAA cabe; BBB continua', text: 'AAAAA BBB', firstTokenLength: 5 },
  { id: 'long-word', label: 'Palavra realmente maior que a caixa', text: 'AAAAAAAAAAA BBB', firstTokenLength: 11 },
  { id: 'nbsp', label: 'NBSP mantém o grupo sem quebra', text: 'AAAAA\u00a0BBB C', firstTokenLength: 9 },
  { id: 'pre', label: 'RichTextRenderer nowrap usa pre e conserva os espaços', text: 'AAAAA BBB', firstTokenLength: 9, nowrap: true },
  { id: 'nowrap', label: 'CSS nowrap: o conteúdo completo ultrapassa a caixa', text: 'AAAAA BBB', firstTokenLength: 9, cssNowrap: true },
  { id: 'image', label: 'Espaço pendurado com imagem realmente fora', text: 'AAAAA BBB', firstTokenLength: 5, image: true },
].map(item => ({ ...item, rich: plainRichText(`hanging-proof-${item.id}`, item.text) }));
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#2563eb"/></svg>');

flushSync(() => createRoot(document.getElementById('root')!).render(<>
  {cases.map(item => <section key={item.id} data-case={item.id}>
    <h2>{item.label}</h2>
    <div data-flow-root="">
      <RichTextRenderer rich={item.rich} nowrap={'nowrap' in item && item.nowrap} />
      {'image' in item && item.image && <img src={image} alt="Imagem maior que a caixa"
        style={{ position: 'absolute', top: 0, left: 0, width: '8ch', height: 64 }} />}
    </div>
  </section>)}
</>));

for (const item of cases) if ('cssNowrap' in item && item.cssNowrap) {
  document.querySelector<HTMLElement>(`[data-case="${item.id}"] [data-paragraph-id]`)!.style.whiteSpace = 'nowrap';
}

function measure() {
  return cases.map(item => {
    const flow = document.querySelector<HTMLElement>(`[data-case="${item.id}"] [data-flow-root]`)!;
    const sourceBefore = JSON.parse(JSON.stringify(item.rich)) as typeof item.rich;
    const recordsBefore = textFlowRecords(flow, item.rich);
    const metrics = intrinsicMetrics(flow, item.rich);
    const metricsAgain = intrinsicMetrics(flow, item.rich);
    const recordsAfter = textFlowRecords(flow, item.rich);
    const box = flow.getBoundingClientRect();
    let leftQ = 0, rightQ = 0, topQ = 0, bottomQ = pxToQ(box.height);
    for (const record of recordsBefore) if (record[0] === 'T') {
      leftQ = Math.min(leftQ, record[4]); rightQ = Math.max(rightQ, record[4] + record[6]);
      topQ = Math.min(topQ, record[5]); bottomQ = Math.max(bottomQ, record[5] + record[7]);
    }
    const text = flow.querySelector('[data-inline-id]')!.firstChild!;
    const firstTokenRange = document.createRange();
    firstTokenRange.setStart(text, 0); firstTokenRange.setEnd(text, item.firstTokenLength);
    const firstTokenBox = firstTokenRange.getBoundingClientRect();
    const img = flow.querySelector('img');
    const imageBox = img?.getBoundingClientRect();
    return {
      id: item.id, sourceBefore, sourceAfter: JSON.parse(JSON.stringify(item.rich)) as typeof item.rich,
      domText: flow.querySelector('[data-inline-id]')!.textContent,
      whiteSpace: getComputedStyle(flow.querySelector('[data-paragraph-id]')!).whiteSpace,
      availableWidthQ: pxToQ(box.width), flowHeightQ: pxToQ(box.height),
      rawTextWidthQ: rightQ - leftQ, rawTextHeightQ: bottomQ - topQ,
      firstTokenWidthQ: pxToQ(firstTokenBox.width),
      recordsBefore, recordsAfter, metrics, metricsAgain,
      image: img && imageBox ? { loaded: img.complete && img.naturalWidth > 0,
        leftQ: pxToQ(imageBox.left - box.left), rightQ: pxToQ(imageBox.right - box.left),
        topQ: pxToQ(imageBox.top - box.top), bottomQ: pxToQ(imageBox.bottom - box.top) } : null,
    };
  });
}

async function ready() {
  await document.fonts.ready;
  await Promise.all([...document.images].map(img => img.decode()));
  window.__HANGING_SPACE_PROOF__ = { measure };
}
void ready();

declare global {
  interface Window { __HANGING_SPACE_PROOF__?: { measure: typeof measure } }
}
