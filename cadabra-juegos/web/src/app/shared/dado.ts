import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
};

@Component({
  selector: 'app-dado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="tam()" [attr.height]="tam()" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5" />
      @for (p of puntos(); track $index) {
        <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="2.1" />
      }
    </svg>
  `,
  styles: `
    :host { display: block; flex: none; line-height: 0; }
    rect { fill: var(--dado-cara, var(--dado)); stroke: var(--dado-borde, var(--tinta)); stroke-width: 1.5; }
    circle { fill: var(--dado-pip, var(--pip)); }
  `,
})
export class Dado {
  readonly valor = input.required<number>();
  readonly tam = input(24);
  protected readonly puntos = computed(() => PIPS[this.valor()] ?? []);
}
