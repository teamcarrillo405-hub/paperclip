import { apiGet } from './client';

export type Company = {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  createdAt: string;
};

export async function fetchCompanies(): Promise<Company[]> {
  return apiGet<Company[]>('/companies');
}

export async function fetchCompany(id: string): Promise<Company> {
  return apiGet<Company>(`/companies/${id}`);
}
