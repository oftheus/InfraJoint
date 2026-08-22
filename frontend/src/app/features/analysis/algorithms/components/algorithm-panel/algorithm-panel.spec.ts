import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../../../../app.config';
import { AlgorithmInput } from '../../algorithm.model';
import { AlgorithmPanel } from './algorithm-panel';

function inputCom(meanEsquerda: number, meanDireita: number): AlgorithmInput {
  const joint = (side: 'Esquerda' | 'Direita', mean: number) => ({
    key: `${side}:9`,
    side,
    landmarkId: 9,
    label: 'MCP 3',
    mean,
    median: mean,
    max: mean + 1,
    min: mean - 1,
    skinCoverage: 0.9,
    sampleCount: 280,
  });

  return {
    frames: [
      {
        captureIndex: 0,
        phase: null,
        timeSeconds: null,
        quality: { alignmentMethod: 'silhouette', agreementNormalized: 0.8, issue: null },
        joints: [joint('Esquerda', meanEsquerda), joint('Direita', meanDireita)],
      },
    ],
  };
}

async function montar() {
  await TestBed.configureTestingModule({
    imports: [AlgorithmPanel],
    providers: [...appConfig.providers],
  }).compileComponents();

  const fixture = TestBed.createComponent(AlgorithmPanel);
  fixture.componentRef.setInput('algorithmInput', inputCom(33.8, 32.4));
  fixture.detectChanges();
  return fixture;
}

/** O botão pelo rótulo, e não pelo índice: a lista de algoritmos virou um select. */
function executar(fixture: { nativeElement: HTMLElement; detectChanges(): void }): void {
  const botao = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Executar'),
  );
  botao!.click();
  fixture.detectChanges();
}

describe('AlgorithmPanel', () => {
  it('não executa sem articulação medida, e diz o que fazer', async () => {
    // A pré-condição comum a todos os algoritmos mora aqui, e é por isso que nenhum
    // `run()` precisa da guarda. O teste dela veio junto com a responsabilidade.
    const fixture = await montar();
    const semMedicao = inputCom(33.8, 32.4);
    fixture.componentRef.setInput('algorithmInput', {
      ...semMedicao,
      frames: [{ ...semMedicao.frames[0], joints: [] }],
    });
    fixture.detectChanges();

    const botao = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.includes('Executar'),
    ) as HTMLButtonElement;

    expect(botao.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Detecte as articulações');
  });

  it('mostra o resultado depois de executar', async () => {
    // Regressão: `limpar()` lia `result()` dentro do effect, o que tornava `result`
    // dependência dele — executar disparava o effect, que zerava o resultado no mesmo
    // ciclo. A tela ficava igual, como se o botão não fizesse nada.
    const fixture = await montar();

    executar(fixture);

    const relatorio = fixture.nativeElement.querySelector('.algorithm-result');
    expect(relatorio).toBeTruthy();
    expect(relatorio.textContent).toContain('MCP 3');
  });

  it('descarta o resultado quando as medições mudam', async () => {
    // A outra metade do contrato: um achado de outras medições não pode continuar
    // na tela depois de o usuário mexer numa ROI.
    const fixture = await montar();

    executar(fixture);
    expect(fixture.nativeElement.querySelector('.algorithm-result')).toBeTruthy();

    fixture.componentRef.setInput('algorithmInput', inputCom(33.0, 33.0));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.algorithm-result')).toBeNull();
  });
});
