export type VehicleCatalogType = 'cars' | 'motorcycles' | 'trucks';

export type VehicleCatalogOption = { code: string; name: string };

const API_ROOT = 'https://fipe.parallelum.com.br/api/v2';
const catalogCache = new Map<string, Promise<VehicleCatalogOption[]>>();

async function getCatalogOptions(path: string): Promise<VehicleCatalogOption[]> {
  const cached = catalogCache.get(path);
  if (cached) return cached;

  const request = fetch(`${API_ROOT}/${path}`)
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 429) throw new Error('O catálogo de veículos atingiu o limite gratuito diário. Tente mais tarde ou preencha os dados manualmente.');
        throw new Error('Não foi possível carregar o catálogo de veículos. Você ainda pode preencher os dados manualmente.');
      }
      const data = await response.json() as VehicleCatalogOption[];
      if (!Array.isArray(data)) throw new Error('O catálogo de veículos retornou dados inválidos. Você ainda pode preencher os dados manualmente.');
      return data.sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
    })
    .catch((reason: unknown) => {
      catalogCache.delete(path);
      if (reason instanceof Error) throw reason;
      throw new Error('Não foi possível conectar ao catálogo de veículos. Você ainda pode preencher os dados manualmente.');
    });

  catalogCache.set(path, request);
  return request;
}

export function listVehicleBrands(type: VehicleCatalogType): Promise<VehicleCatalogOption[]> {
  return getCatalogOptions(`${type}/brands`);
}

export function listVehicleModels(type: VehicleCatalogType, brandCode: string): Promise<VehicleCatalogOption[]> {
  return getCatalogOptions(`${type}/brands/${encodeURIComponent(brandCode)}/models`);
}

export function listVehicleYears(type: VehicleCatalogType, brandCode: string, modelCode: string): Promise<VehicleCatalogOption[]> {
  return getCatalogOptions(`${type}/brands/${encodeURIComponent(brandCode)}/models/${encodeURIComponent(modelCode)}/years`);
}
