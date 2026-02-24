import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class GenerateVariantDto {
  /**
   * Desplazamiento tonal en semitonos enteros.
   * -12 (octava abajo) .. +12 (octava arriba). 0 = sin cambio.
   */
  @IsInt()
  @Min(-12)
  @Max(12)
  pitchShift: number;

  /**
   * Multiplicador de tempo. 1.0 = velocidad original.
   * 0.5 = mitad de velocidad, 2.0 = doble de velocidad.
   * Máximo 2 decimales de precisión.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(2.0)
  tempo: number;
}
