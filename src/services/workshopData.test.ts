import type { SupabaseClient } from '@supabase/supabase-js';
import { inviteWorkshopEmployee, listCustomers, reverseFinancialEntry, saveCustomer, saveVehicle, uploadServiceOrderPhoto, uploadWorkshopLogo } from './workshopData';
import type { CustomerInput, VehicleInput } from '../types/workshop';

const noNetworkClient = {} as SupabaseClient;

const validCustomer: CustomerInput = {
  full_name: 'Cliente de teste', document: null, phone: null, whatsapp: null,
  email: null, address: null, city: null, state: null, notes: null,
};

const validVehicle: VehicleInput = {
  customer_id: '00000000-0000-4000-8000-000000000001', make: 'Ford', model: 'Ka',
  year_manufacture: 2020, model_year: 2021, plate: 'ABC1D23', color: null,
  mileage_km: null, fuel: 'flex', chassis: null, notes: null,
};

describe('workshop data validation', () => {
  it('reports that a newly invited employee must accept the email invitation', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { membership_id: 'membership-a', reused_existing_account: false, invitation_sent: true }, error: null });
    const client = { functions: { invoke } } as unknown as SupabaseClient;
    const permissions = { dashboard: { view: true, create: false, update: false, delete: false } };

    const result = await inviteWorkshopEmployee('tenant-a', 'Pessoa Teste', 'funcionario@example.com', permissions, client);

    expect(invoke).toHaveBeenCalledWith('manage-workshop', {
      body: { action: 'invite_employee', workshop_id: 'tenant-a', full_name: 'Pessoa Teste', email: 'funcionario@example.com', permissions },
    });
    expect(result).toEqual({ reusedExistingAccount: false, invitationSent: true });
  });

  it('reports when an existing employee account was linked without another email', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { membership_id: 'membership-b', reused_existing_account: true, invitation_sent: false }, error: null });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    const result = await inviteWorkshopEmployee('tenant-a', 'Pessoa Teste', 'funcionario@example.com', {}, client);

    expect(result).toEqual({ reusedExistingAccount: true, invitationSent: false });
  });

  it('shows the Portuguese error returned by employee invitation handling', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { error: 'Este e-mail já tem acesso a esta oficina.' }, error: null });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await expect(inviteWorkshopEmployee('tenant-a', 'Pessoa Teste', 'funcionario@example.com', {}, client))
      .rejects.toThrow('Este e-mail já tem acesso a esta oficina.');
  });

  it('rejects a customer without a name before attempting a network request', async () => {
    await expect(saveCustomer('tenant-a', { ...validCustomer, full_name: ' ' }, undefined, noNetworkClient))
      .rejects.toThrow('Informe o nome completo do cliente.');
  });

  it('rejects a document with an invalid CPF/CNPJ digit count', async () => {
    await expect(saveCustomer('tenant-a', { ...validCustomer, document: '123.456' }, undefined, noNetworkClient))
      .rejects.toThrow('CPF deve ter 11 dígitos e CNPJ deve ter 14.');
  });

  it('accepts a CPF digit count and lets PostgreSQL enforce duplicate prevention', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient;
    await saveCustomer('tenant-a', { ...validCustomer, document: '123.456.789-00' }, undefined, client);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ workshop_id: 'tenant-a', document: '123.456.789-00' }));
  });

  it('rejects a vehicle without a customer link', async () => {
    await expect(saveVehicle('tenant-a', { ...validVehicle, customer_id: '' }, undefined, noNetworkClient))
      .rejects.toThrow('Selecione o cliente responsável pelo veículo.');
  });

  it('requires a reason and sends reversals through the permission-checked database RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(reverseFinancialEntry('tenant-a', 'entry-a', '  ', client)).rejects.toThrow('Informe o motivo do estorno');
    await reverseFinancialEntry('tenant-a', 'entry-a', ' Correção do lançamento ', client);
    expect(rpc).toHaveBeenCalledWith('reverse_financial_entry', { target_workshop: 'tenant-a', target_entry: 'entry-a', reversal_reason: 'Correção do lançamento' });
  });

  it('rejects a plate with a length outside the Brazilian seven-character format', async () => {
    await expect(saveVehicle('tenant-a', { ...validVehicle, plate: 'ABC123' }, undefined, noNetworkClient))
      .rejects.toThrow('Informe uma placa válida com 7 caracteres.');
  });

  it('rejects unsupported image types and files larger than the private upload limit', async () => {
    await expect(uploadServiceOrderPhoto('tenant-a','order-a',new Blob(['x']),'photo.gif','image/gif','',noNetworkClient))
      .rejects.toThrow('Use uma foto JPEG, PNG, WebP ou HEIC.');
    const oversized = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]);
    await expect(uploadServiceOrderPhoto('tenant-a','order-a',oversized,'photo.jpg','image/jpeg','',noNetworkClient))
      .rejects.toThrow('A foto precisa ter até 10 MB.');
  });

  it('validates logo type and size before accessing Supabase', async () => {
    await expect(uploadWorkshopLogo('tenant-a', new Blob(['x']), 'logo.gif', 'image/gif', noNetworkClient))
      .rejects.toThrow('Use um logotipo JPEG, PNG ou WebP.');
    const oversized = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]);
    await expect(uploadWorkshopLogo('tenant-a', oversized, 'logo.png', 'image/png', noNetworkClient))
      .rejects.toThrow('O logotipo precisa ter até 5 MB.');
  });

  it('loads customer records beyond the first PostgREST page', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: `customer-${index}`, full_name: `Customer ${index}` }));
    const range = jest.fn(async (from: number) => ({ data: from === 0 ? firstPage : [{ id: 'customer-500', full_name: 'Customer 500' }], error: null }));
    const query: { order: jest.Mock; range: typeof range } = { order: jest.fn(), range };
    query.order.mockReturnValue(query);
    const is = jest.fn(() => query); const eq = jest.fn(() => ({ is }));
    const select = jest.fn(() => ({ eq })); const client = { from: jest.fn(() => ({ select })) } as unknown as SupabaseClient;
    const rows = await listCustomers('tenant-a', client);
    expect(rows).toHaveLength(501);
    expect(range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it('removes an uploaded object if the attachment metadata insert fails', async () => {
    const uploadToSignedUrl = jest.fn().mockResolvedValue({ error: null });
    const path = 'tenant-a/order-a/photo-id.jpg';
    const invoke = jest.fn()
      .mockResolvedValueOnce({ data: { path, token: 'upload-token' }, error: null })
      .mockResolvedValueOnce({ data: { removed: true }, error: null });
    const storage = { from: jest.fn(() => ({ uploadToSignedUrl })) };
    const insert = jest.fn().mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    const client = { functions: { invoke }, storage, from: jest.fn(() => ({ insert })) } as unknown as SupabaseClient;
    await expect(uploadServiceOrderPhoto('tenant-a','order-a',new Blob(['image']),'photo.jpg','image/jpeg','front',client))
      .rejects.toThrow('Seu usuário não tem permissão para essa operação.');
    expect(uploadToSignedUrl).toHaveBeenCalledWith(path, 'upload-token', expect.any(Blob), expect.objectContaining({ contentType: 'image/jpeg', upsert: false }));
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-private-files', {
      body: { action: 'remove_photo', kind: 'photo', workshop_id: 'tenant-a', service_order_id: 'order-a', storage_path: path },
    });
  });
});
