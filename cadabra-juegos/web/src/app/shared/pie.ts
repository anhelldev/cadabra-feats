import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { URL_BASE } from '../core/recursos';

@Component({
  selector: 'app-pie',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="ancho">
      <p>
        Developed by
        <a href="https://anhelldev.github.io/" target="_blank" rel="noopener">anhelldev</a>
      </p>
      @if (bgg()) {
        <a class="bgg" href="https://boardgamegeek.com" target="_blank" rel="noopener" aria-label="Powered by BoardGameGeek">
          <img [src]="logoBgg" alt="Powered by BGG" width="109" height="32" />
        </a>
      }
    </footer>
  `,
  styles: `
    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      padding-top: 20px;
      /* Espacio abajo para que los avisos flotantes no tapen el pie. */
      padding-bottom: 72px;
      border-top: 1px solid var(--linea);
      color: var(--tenue);
      font-size: 0.85rem;
    }
    p {
      margin: 0;
    }
    a {
      color: var(--accion);
      font-weight: 600;
    }
    /* El logo tiene letras azul oscuro: sobre el tema oscuro necesita fondo claro para leerse. */
    .bgg {
      display: inline-flex;
      padding: 6px 12px;
      border-radius: 10px;
      background: #fff;
      border: 1px solid var(--linea);
    }
    .bgg img {
      display: block;
    }
  `,
})
export class Pie {
  /** Muestra el logo "Powered by BGG": solo donde se usan datos de BoardGameGeek. */
  readonly bgg = input(true);
  protected readonly logoBgg = `${inject(URL_BASE)}img/powered-by-bgg.png`;
}
