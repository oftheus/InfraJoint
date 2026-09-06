import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../../environments/environment';
import { AlgorithmsPage } from './algorithms-page';

const ALGORITMOS = `${environment.apiBaseUrl}/algorithms`;
const PACIENTES = `${environment.apiBaseUrl}/patients`;

function texto(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

/** O botão pelo rótulo, e não pelo índice: a tela tem outros botões. */
function executar(fixture: { nativeElement: HTMLElement }): HTMLButtonElement {
  const botao = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Executar'),
  );
  if (!botao) {
    throw new Error('botão Executar não encontrado');
  }
  return botao as HTMLButtonElement;
}

async function montar(algoritmos: unknown[]) {
  await TestBed.configureTestingModule({
    imports: [AlgorithmsPage],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  const fixture = TestBed.createComponent(AlgorithmsPage);
  const controller = TestBed.inject(HttpTestingController);
  fixture.detectChanges();

  controller.expectOne(ALGORITMOS).flush(algoritmos);
  controller.expectOne(PACIENTES).flush([{ id: 'p1', full_name: 'Ana' }]);
  fixture.detectChanges();
  return { fixture, controller };
}

const ANALISE = {
  slug: 'assimetria',
  title: 'Assimetria térmica',
  description: 'Compara os dois lados.',
  scope: 'analysis',
};

describe('AlgorithmsPage', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra os algoritmos que o servidor registrou', async () => {
    // A lista é do servidor, sempre: é isso que faz acrescentar um algoritmo não
    // custar nada aqui.
    const { fixture, controller } = await montar([ANALISE]);

    expect(texto(fixture)).toContain('Assimetria térmica');
    expect(texto(fixture)).toContain('Compara os dois lados.');
    controller.verify();
  });

  it('avisa quando o servidor não tem algoritmo nenhum', async () => {
    const { fixture, controller } = await montar([]);

    expect(texto(fixture)).toContain('Nenhum algoritmo registrado');
    controller.verify();
  });

  it('não deixa executar antes de escolher a consulta', async () => {
    const { fixture, controller } = await montar([ANALISE]);

    expect(executar(fixture).disabled).toBe(true);
    expect(texto(fixture)).toContain('Escolha o paciente.');
    controller.verify();
  });

  it('só oferece consultas com análise de imagem gravada', async () => {
    // Uma consulta sem análise só teria como devolver "dados insuficientes", então
    // oferecê-la é oferecer uma execução inútil.
    const { fixture, controller } = await montar([ANALISE]);

    const paciente = fixture.nativeElement.querySelector('#paciente') as HTMLSelectElement;
    paciente.value = 'p1';
    paciente.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    controller.expectOne(`${PACIENTES}/p1`).flush({
      id: 'p1',
      full_name: 'Ana',
      encounters: [
        { id: 'e1', occurred_at: '2026-09-01T10:00:00Z', analysis_status: null, capture_count: 0 },
      ],
    });
    fixture.detectChanges();

    expect(texto(fixture)).toContain('não tem consulta com análise de imagem gravada');
    expect(executar(fixture).disabled).toBe(true);
    controller.verify();
  });

  it('explica o algoritmo de coorte em vez de oferecer execução', async () => {
    // Nenhum existe hoje. A tela trata o caso porque a lista é do servidor: no dia
    // em que o primeiro for registrado lá, ele aparece aqui sem deploy do frontend,
    // e aparecer sem explicação seria pior do que aparecer dizendo o que falta.
    const { fixture, controller } = await montar([
      { ...ANALISE, slug: 'coorte', title: 'Casos x controles', scope: 'cohort' },
    ]);

    expect(texto(fixture)).toContain('coorte ainda não têm tela de recorte');
    expect(fixture.nativeElement.querySelector('#paciente')).toBeNull();
    expect(executar(fixture).disabled).toBe(true);
    controller.verify();
  });
});
