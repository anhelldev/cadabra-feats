import { inject, Injectable, InjectionToken } from '@angular/core';
import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Opciones del cliente. Los elements públicos (WordPress) lo usan para no tocar el almacenamiento ni la URL de la página. */
export const OPCIONES_SUPABASE = new InjectionToken<SupabaseClientOptions<'public'>>('OPCIONES_SUPABASE');

@Injectable({ providedIn: 'root' })
export class Supabase {
  readonly client = createClient(environment.supabaseUrl, environment.supabaseKey, inject(OPCIONES_SUPABASE, { optional: true }) ?? undefined);
}
