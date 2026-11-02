// Ícones de traço do Tabler Icons (https://tabler.io/icons), a pedido do usuário (02/11/2026): as
// ajudas do Setlist Royale usam o olho e o "repeat" dos rabiscos da escolha do desenho, fora do
// traço de marcador do designer (P218). Os caminhos são os do pacote @tabler/icons 3.19.0, sem
// mudança: os subcaminhos de cada ícone vão num `d` só, e o `Icon` os desenha em contorno de 2,
// com as pontas redondas, como no original.
//
// Tabler Icons: MIT License, Copyright (c) 2020-2024 Paweł Kuna.
export const STROKE_ICONS = {
  eye: {
    viewBox: "0 0 24 24",
    d: "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
    stroke: true,
  },
  repeat: {
    viewBox: "0 0 24 24",
    d: "M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3",
    stroke: true,
  },
} as const;

export type StrokeIconName = keyof typeof STROKE_ICONS;
