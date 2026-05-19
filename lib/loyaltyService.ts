import { supabase } from './supabase';

export interface LoyaltyProgram {
  id: string;
  name: string;
  description: string | null;
  trigger_type: 'scan' | 'purchase' | 'manual' | 'pass';
  points_per_trigger: number;
  points_per_rm: number | null;
  threshold: number;
  voucher_type: 'fixed' | 'percent';
  voucher_discount_value: number;
  voucher_validity_days: number;
  voucher_min_order: number | null;
  pass_type: 'use_based' | 'time_based' | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface LoyaltyMember {
  id: string;
  phone: string;
  name: string | null;
  enrolled_at: string;
  updated_at: string;
}

export async function upsertMember(phone: string, name?: string): Promise<LoyaltyMember> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('loyalty_members')
    .upsert(
      { phone, ...(name ? { name } : {}), updated_at: now },
      { onConflict: 'phone' }
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

function generateVoucherCode(): string {
  return `VCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function generatePassCode(): string {
  return `PASS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createOrTopUpPass(
  member: { id: string },
  program: LoyaltyProgram,
  opts?: { uses?: number; expiresAt?: string },
): Promise<{ code: string; uses_remaining: number; is_new: boolean }> {
  const now = new Date().toISOString();
  const usesToAdd = opts?.uses ?? program.points_per_trigger;

  const { data: existing } = await supabase
    .from('loyalty_member_programs')
    .select('id, points_balance, total_earned, code, is_active, expires_at')
    .eq('member_id', member.id)
    .eq('program_id', program.id)
    .single();

  if (existing) {
    if (program.pass_type === 'time_based' && existing.is_active && existing.points_balance > 0) {
      if (!existing.expires_at || new Date(existing.expires_at) > new Date()) {
        throw new Error('Active time-based pass exists — cannot top up until it expires');
      }
    }

    const newBalance = existing.points_balance + usesToAdd;
    const { error } = await supabase
      .from('loyalty_member_programs')
      .update({
        points_balance: newBalance,
        total_earned: existing.total_earned + usesToAdd,
        is_active: true,
        expires_at: opts?.expiresAt ?? existing.expires_at,
        updated_at: now,
      })
      .eq('id', existing.id);

    if (error) throw new Error(error.message);
    return { code: existing.code!, uses_remaining: newBalance, is_new: false };
  }

  const code = generatePassCode();
  const { error } = await supabase
    .from('loyalty_member_programs')
    .insert({
      member_id: member.id,
      program_id: program.id,
      points_balance: usesToAdd,
      total_earned: usesToAdd,
      code,
      is_active: true,
      expires_at: opts?.expiresAt ?? null,
      enrolled_at: now,
      updated_at: now,
    });

  if (error) throw new Error(error.message);
  return { code, uses_remaining: usesToAdd, is_new: true };
}

async function issueVoucher(
  member: { id: string },
  program: LoyaltyProgram,
  referenceId: string | null,
  now: string,
) {
  const code = generateVoucherCode();
  const expiresAt = program.voucher_validity_days
    ? new Date(Date.now() + program.voucher_validity_days * 86_400_000).toISOString()
    : null;

  const { data, error } = await supabase.from('vouchers').insert({
    code,
    member_id: member.id,
    type: program.voucher_type,
    discount_value: program.voucher_discount_value,
    min_order_amount: program.voucher_min_order ?? 0,
    expires_at: expiresAt,
    source: 'loyalty',
    max_uses: 1,
    times_used: 0,
    is_active: true,
  }).select().single();

  if (error) throw new Error(error.message);
  return data;
}

export async function awardPoints(
  member: { id: string },
  program: LoyaltyProgram,
  opts: {
    type: string;
    description: string;
    reference_id: string | null;
    pointsOverride?: number;
    now?: string;
  },
): Promise<{ points_added: number; new_balance: number; vouchers_issued: any[] }> {
  const now = opts.now ?? new Date().toISOString();
  const points = opts.pointsOverride ?? program.points_per_trigger;

  const { data: enrollment } = await supabase
    .from('loyalty_member_programs')
    .upsert(
      { member_id: member.id, program_id: program.id, updated_at: now },
      { onConflict: 'member_id,program_id', ignoreDuplicates: false },
    )
    .select('id, points_balance, total_earned')
    .single();

  if (!enrollment) return { points_added: points, new_balance: 0, vouchers_issued: [] };

  const newBalance = enrollment.points_balance + points;
  const vouchersToIssue = Math.floor(newBalance / program.threshold);
  const remainder = newBalance % program.threshold;

  await supabase
    .from('loyalty_member_programs')
    .update({
      points_balance: remainder,
      total_earned: enrollment.total_earned + points,
      updated_at: now,
    })
    .eq('id', enrollment.id);

  const txPayload = {
    member_id: member.id,
    program_id: program.id,
    type: opts.type,
    points,
    description: opts.description,
    reference_id: opts.reference_id,
    source: 'pos',
    created_at: now,
  };
  const { error: txError } = await supabase.from('loyalty_transactions').insert(txPayload);
  if (txError) console.error('❌ Failed to insert loyalty transaction:', JSON.stringify(txError));

  const vouchers_issued = [];
  for (let i = 0; i < vouchersToIssue; i++) {
    const voucher = await issueVoucher(member, program, opts.reference_id, now);
    vouchers_issued.push(voucher);
  }

  return { points_added: points, new_balance: remainder, vouchers_issued };
}
