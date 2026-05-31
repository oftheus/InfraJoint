import { Component } from '@angular/core';

import {
  PlatformFeature,
  PlatformFeatureCard,
} from '../../../../components/platform-feature-card/platform-feature-card';

@Component({
  selector: 'app-resources-section',
  imports: [PlatformFeatureCard],
  templateUrl: './resources-section.component.html',
})
export class ResourcesSectionComponent {
  protected readonly platformFeatures: readonly PlatformFeature[] = [
    {
      title: 'Integração de Algoritmos',
      description:
        'Arquitetura extensível para integração de algoritmos externos com saída padronizada.',
      icon: 'workflow',
      cardColor: '#F7FAFC',
      iconColor: '#1B3A57',
      iconBackgroundColor: '#EAF2F8',
    },
    {
      title: 'Visualização Multimodal',
      description: 'Sobreposição de imagens térmicas e ópticas com controle de opacidade.',
      icon: 'layers',
      cardColor: '#F7FAFC',
      iconColor: '#246BA8',
      iconBackgroundColor: '#E5F1FA',
    },
    {
      title: 'Regiões de Interesse',
      description: 'Definição e manipulação de ROIs para extração de métricas por articulação.',
      icon: 'target',
      cardColor: '#F7FAFC',
      iconColor: '#32B5FE',
      iconBackgroundColor: '#E5F8FF',
    },
    {
      title: 'Evolução Temporal',
      description:
        'Histórico de exames por paciente e evolução de índices clínicos ao longo do tempo.',
      icon: 'timeline',
      cardColor: '#F7FAFC',
      iconColor: '#4A91C7',
      iconBackgroundColor: '#E8F4FB',
    },
    {
      title: 'Métricas Quantitativas',
      description: 'Cálculo automatizado de CDAI e DAS28 a partir dos dados do exame.',
      icon: 'chart',
      cardColor: '#F7FAFC',
      iconColor: '#68A9D6',
      iconBackgroundColor: '#EDF7FC',
    },
  ];
}
