-- ============================================================================
-- TALABALARNI RAG'BATLANTIRISH VA MUKOFOTLASH REESTRI
--
-- Ikki turdagi yozuvni bitta jadvalda birlashtiradi (kind ustuni orqali):
--   incentive - rag'bat puli (musobaqa/tadbirdagi o'rin uchun pul mukofoti)
--   prize     - mukofot (qo'lda belgilanadigan, majburiy tanlov/musobaqaga
--               bog'lanmasligi ham mumkin - masalan tashqi olimpiada)
--
-- Oqim (ikkalasi uchun ham bir xil): koordinator/tyutor/talaba TAKLIF qiladi
-- (pending) -> admin TASDIQLAYDI (approved, shundagina rasmiy reestrga
-- kiradi) yoki RAD ETADI (rejected).
--
-- "incentive" yozuvida source='auto' bo'lsa - o'rin (place) va ishtirok
-- tavsifi tizim tomonidan haqiqiy natijadan (getLeaderboard/
-- getActivityFinalSnapshot) olib to'ldiriladi, faqat pul miqdori qo'lda
-- kiritiladi. source='manual' - haqiqiy hisoblangan natija bo'lmagan
-- tanlovlar uchun, hammasi qo'lda.
-- ============================================================================

create table if not exists student_recognitions (
    id text primary key,
    kind text not null check (kind in ('incentive', 'prize')),
    activity_type text check (activity_type in ('event', 'competition')),
    activity_id text,
    activity_title text, -- reestr eksportida guruh sarlavhasi uchun - faoliyat keyin o'chirilsa ham saqlanib qoladi
    student_id text not null,
    source text not null default 'manual' check (source in ('auto', 'manual')),
    place int,
    participation_description text,
    amount text, -- faqat kind='incentive' uchun ma'noli, erkin matn ("600'000 (olti yuz ming) so'm")
    prize_title text, -- faqat kind='prize' uchun ma'noli
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    proposed_by text,
    proposed_at timestamptz not null default now(),
    reviewed_by text,
    reviewed_at timestamptz,
    review_comment text,
    data jsonb not null default '{}'::jsonb
);

create index if not exists idx_student_recognitions_status on student_recognitions(status);
create index if not exists idx_student_recognitions_student on student_recognitions(student_id);
create index if not exists idx_student_recognitions_activity on student_recognitions(activity_type, activity_id);

alter table student_recognitions enable row level security;

-- O'qish - hammaga ochiq (amaliy cheklov admin panelidagina ko'rinishida - mavjud konvensiya).
-- Yozish - faqat admin (security-definer emas, chunki koordinator/tyutorning "taklif qilish"
-- huquqi klub a'zoligiga bog'liq va bu allaqachon ilova darajasida tekshiriladi; yozuv o'zi
-- har doim `pending` holatda boshlanadi va faqat admin uni `approved`ga o'tkaza oladi - shu
-- YAGONA amaliy jihatdan muhim qadam quyida RPC orqali bajariladi).
drop policy if exists student_recognitions_select on student_recognitions;
create policy student_recognitions_select on student_recognitions for select using (true);
drop policy if exists student_recognitions_insert on student_recognitions;
create policy student_recognitions_insert on student_recognitions for insert with check (true);
drop policy if exists student_recognitions_update_own_pending on student_recognitions;
create policy student_recognitions_update_own_pending on student_recognitions for update
    using (proposed_by = current_username() and status = 'pending')
    with check (status = 'pending');
drop policy if exists student_recognitions_delete_own_pending on student_recognitions;
create policy student_recognitions_delete_own_pending on student_recognitions for delete
    using (proposed_by = current_username() and status = 'pending');

-- Faqat admin bu orqali tasdiqlaydi/rad etadi - status 'pending' dan boshqa holatga
-- shu funksiyadan tashqari o'zgarmaydi (generic update policy buni ataylab bermaydi).
create or replace function review_student_recognition(
    p_id text, p_status text, p_reviewed_by text, p_comment text default null
) returns void
language plpgsql security definer as $$
begin
    if not is_platform_admin() then
        raise exception 'Faqat admin tasdiqlashi mumkin';
    end if;
    if p_status not in ('approved', 'rejected') then
        raise exception 'Notogri holat';
    end if;
    update student_recognitions
        set status = p_status, reviewed_by = p_reviewed_by, reviewed_at = now(), review_comment = p_comment
        where id = p_id and status = 'pending';
end;
$$;
