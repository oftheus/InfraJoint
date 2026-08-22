import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../../../app.config';
import { ImageAnalyzerPage } from './image-analyzer-page';

/**
 * Guarda de regressão da tela solta.
 *
 * A Fase 5 mexeu nesta página — expôs signais, passou a reter os arquivos de origem
 * e trocou a raiz de `<main>` para `<div>` com `role` condicional. Nada disso pode
 * ter quebrado a tela que qualquer um usa para experimentar.
 */
describe('ImageAnalyzerPage', () => {
  it('monta e renderiza como página independente', async () => {
    // Reusa os providers da aplicação: sem eles os ícones Lucide não resolvem, e o
    // teste falharia por ambiente, não por regressão.
    await TestBed.configureTestingModule({
      imports: [ImageAnalyzerPage],
      providers: [...appConfig.providers],
    }).compileComponents();

    const fixture = TestBed.createComponent(ImageAnalyzerPage);
    fixture.detectChanges();

    const raiz = fixture.nativeElement.querySelector('div.text-ink-strong');
    expect(raiz).toBeTruthy();
    // Sem `embedded`, a página continua sendo o marco principal para leitor de tela.
    expect(raiz.getAttribute('role')).toBe('main');
  });

  it('embutida no fluxo, abre mão do papel de main', async () => {
    // Reusa os providers da aplicação: sem eles os ícones Lucide não resolvem, e o
    // teste falharia por ambiente, não por regressão.
    await TestBed.configureTestingModule({
      imports: [ImageAnalyzerPage],
      providers: [...appConfig.providers],
    }).compileComponents();

    const fixture = TestBed.createComponent(ImageAnalyzerPage);
    fixture.componentRef.setInput('embedded', true);
    fixture.detectChanges();

    // <main> dentro de <main> é HTML inválido e atrapalha leitor de tela.
    const raiz = fixture.nativeElement.querySelector('div.text-ink-strong');
    expect(raiz.getAttribute('role')).toBeNull();
  });

  it('mantém o painel de algoritmos quando a rota zera o input', () => {
    // Regressão: como componente de rota, `withComponentInputBinding()` chama
    // `setInput('showAlgorithms', undefined)` — a rota não fornece o valor. Sem o
    // `transform`, isso sobrescrevia o padrão `true` e o painel sumia da tela solta,
    // continuando visível nas telas que embutem a página. É o caminho da rota que
    // este teste reproduz, e não uma chamada que algum template faça.
    const fixture = TestBed.createComponent(ImageAnalyzerPage);
    fixture.componentRef.setInput('showAlgorithms', undefined);

    expect(fixture.componentInstance.showAlgorithms()).toBe(true);
  });

  it('respeita o desligamento explícito do painel', () => {
    // O fluxo de Análise Térmica desliga de propósito: lá o painel é a etapa 4.
    const fixture = TestBed.createComponent(ImageAnalyzerPage);
    fixture.componentRef.setInput('showAlgorithms', false);

    expect(fixture.componentInstance.showAlgorithms()).toBe(false);
  });

  it('começa sem arquivo de origem retido', () => {
    const fixture = TestBed.createComponent(ImageAnalyzerPage);
    const page = fixture.componentInstance;

    expect(page.rgbFile()).toBeNull();
    expect(page.csvFile()).toBeNull();
    expect(page.jpegFile()).toBeNull();
  });
});
