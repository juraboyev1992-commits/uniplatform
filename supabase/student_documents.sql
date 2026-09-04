-- ===========================================================================
-- TALABA HUJJATLARI VA IJTIMOIY FAOLLIK INDEKSINING YUBORISH QATLAMI
--
-- IKKI MUAMMONI BIRGA HAL QILADI, chunki ular bir narsaning ikki tomoni.
--
-- 1-MUAMMO: INDEKS YUBORISHLARI BRAUZERDAN CHIQMASDI.
--    `socialIndexEvidence`, `socialIndexAssessments`, `socialIndexRequests`
--    va `socialIndexAppeals` faqat localStorage da saqlanardi - hech biri
--    Supabase'ga yozilmasdi. Ya'ni talaba hujjat yuborardi, tyutor esa
--    boshqa kompyuterda hech narsa ko'rmasdi. 5-mezonning asosiy oqimi
--    ("talaba yuklaydi, tyutor tasdiqlaydi") amalda ishlamasdi.
--
-- 2-MUAMMO: FAYLNING O'ZI SAQLANMASDI.
--    Faqat `fileName` yozilardi. Tyutor hujjat NOMINI ko'rardi, ochib
--    ko'ra olmasdi - ya'ni tekshirish imkonsiz edi.
--
-- YECHIM: bitta TALABA HUJJATLARI OMBORI + indeks jadvallari.
--
-- Nega bitta ombor: talaba til sertifikatini bir marta yuklaydi va u
-- 5-mezon dalili sifatida ham, portfolioda ham, stipendiya arizasida ham
-- ishlatiladi. Uchta alohida yuklash yo'li qurilsa, u har safar qaytadan
-- yuklashi kerak bo'lardi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TALABA HUJJATLARI
--
--    Bu berilgan RASMIY hujjatlar (`documents` jadvali) EMAS - ular
--    universitet chiqaradi va QR bilan tekshiriladi. Bu esa talabaning
--    O'ZI yuklaydigan tashqi hujjatlari: til sertifikati, maqola, tashqi
--    tanlov diplomi, pasport nusxasi.
-- ---------------------------------------------------------------------------
create table if not exists public.student_documents (
    id          text primary key,
    student_id  text not null,
    doc_type    text not null,                       -- config/studentDocuments.js
    title       text not null,
    file_path   text,                                -- yopiq ombordagi yo'l
    data        jsonb not null default '{}'::jsonb,  -- { fileName, size, mimeType, issuedAt, issuer, note }
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists student_documents_student_idx on public.student_documents (student_id);
create index if not exists student_documents_type_idx    on public.student_documents (doc_type);

-- ---------------------------------------------------------------------------
-- 2. INDEKS: ASOSLOVCHI HUJJATLAR
--
--    `document_id` - yuqoridagi ombordagi hujjatga havola. Talaba bir marta
--    yuklagan faylni mezonga BIRIKTIRADI, qaytadan yuklamaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.social_index_evidence (
    id             text primary key,
    student_id     text not null,
    criterion_key  text not null,
    academic_year  text not null,
    status         text not null default 'pending',  -- pending|accepted|returned|rejected
    document_id    text,
    data           jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists sie_student_idx on public.social_index_evidence (student_id);
create index if not exists sie_status_idx  on public.social_index_evidence (status);

-- ---------------------------------------------------------------------------
-- 3. INDEKS: MEZON BAHOLARI
--
--    Bir talaba + bir mezon + bir o'quv yili = BITTA baho. Cheklov bazada:
--    ikki mas'ul bir vaqtda baholasa, ikkinchi yozuv paydo bo'lmasligi
--    kerak - aks holda qaysi baho haqiqiy ekani noaniq bo'lardi.
-- ---------------------------------------------------------------------------
create table if not exists public.social_index_assessments (
    id             text primary key,
    student_id     text not null,
    criterion_key  text not null,
    academic_year  text not null,
    points         numeric not null,
    data           jsonb not null default '{}'::jsonb, -- { comment, assessedBy, assessedAt, snapshot, proposedPoints }
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (student_id, criterion_key, academic_year)
);

create index if not exists sia_student_idx on public.social_index_assessments (student_id);

-- ---------------------------------------------------------------------------
-- 4. INDEKS: TASDIQLASH SO'ROVLARI
-- ---------------------------------------------------------------------------
create table if not exists public.social_index_requests (
    id             text primary key,
    student_id     text not null,
    criterion_key  text not null,
    academic_year  text not null,
    data           jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    unique (student_id, criterion_key, academic_year)
);

-- ---------------------------------------------------------------------------
-- 5. INDEKS: E'TIROZLAR
-- ---------------------------------------------------------------------------
create table if not exists public.social_index_appeals (
    id             text primary key,
    evidence_id    text not null,
    student_id     text not null,
    status         text not null default 'pending',   -- pending|decided
    data           jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists sap_student_idx on public.social_index_appeals (student_id);
create index if not exists sap_status_idx  on public.social_index_appeals (status);

-- ---------------------------------------------------------------------------
-- 6. RUXSATLAR
--
--    O'qish hamma uchun ochiq (tizimga kirgan): tyutor, koordinator va
--    komissiya talabaning dalilini ko'rishi kerak, ularning vakolati esa
--    KODDA tekshiriladi (biriktiruv bo'yicha, rol bo'yicha emas).
--
--    Yozish ham ochiq: yuboruvchi talabaning o'zi, baholovchi esa mas'ul.
--    Haqiqiy nazorat holat maydonida: tasdiqlanmagan dalil ball bermaydi.
-- ---------------------------------------------------------------------------
--    HAR JADVAL UCHUN ALOHIDA YOZILGAN, sikl bilan emas.
--
--    Ilgari bu yerda `do $$ ... execute format(...) $$` bloki turardi.
--    U qisqaroq edi, lekin Supabase'ning tekshiruvchisi DINAMIK SQL ichini
--    o'qiy olmaydi va "jadvallar RLS'siz yaratilmoqda" degan ogohlantirish
--    berardi - aslida RLS yoqilgan bo'lsa ham. Ochiq yozilgan SQL uzunroq,
--    lekin u ham odamga, ham tekshiruvchiga ko'rinadi.

alter table public.student_documents        enable row level security;
alter table public.social_index_evidence    enable row level security;
alter table public.social_index_assessments enable row level security;
alter table public.social_index_requests    enable row level security;
alter table public.social_index_appeals     enable row level security;

-- --- student_documents ---
drop policy if exists student_documents_select on public.student_documents;
drop policy if exists student_documents_insert on public.student_documents;
drop policy if exists student_documents_update on public.student_documents;
drop policy if exists student_documents_delete on public.student_documents;

create policy student_documents_select on public.student_documents
    for select to authenticated using (true);
create policy student_documents_insert on public.student_documents
    for insert to authenticated with check (true);
create policy student_documents_update on public.student_documents
    for update to authenticated using (true) with check (true);
create policy student_documents_delete on public.student_documents
    for delete to authenticated using (true);

-- --- social_index_evidence ---
drop policy if exists sie_select on public.social_index_evidence;
drop policy if exists sie_insert on public.social_index_evidence;
drop policy if exists sie_update on public.social_index_evidence;
drop policy if exists sie_delete on public.social_index_evidence;

create policy sie_select on public.social_index_evidence
    for select to authenticated using (true);
create policy sie_insert on public.social_index_evidence
    for insert to authenticated with check (true);
create policy sie_update on public.social_index_evidence
    for update to authenticated using (true) with check (true);
create policy sie_delete on public.social_index_evidence
    for delete to authenticated using (true);

-- --- social_index_assessments ---
drop policy if exists sia_select on public.social_index_assessments;
drop policy if exists sia_insert on public.social_index_assessments;
drop policy if exists sia_update on public.social_index_assessments;
drop policy if exists sia_delete on public.social_index_assessments;

create policy sia_select on public.social_index_assessments
    for select to authenticated using (true);
create policy sia_insert on public.social_index_assessments
    for insert to authenticated with check (true);
create policy sia_update on public.social_index_assessments
    for update to authenticated using (true) with check (true);
create policy sia_delete on public.social_index_assessments
    for delete to authenticated using (true);

-- --- social_index_requests ---
drop policy if exists sir_select on public.social_index_requests;
drop policy if exists sir_insert on public.social_index_requests;
drop policy if exists sir_update on public.social_index_requests;
drop policy if exists sir_delete on public.social_index_requests;

create policy sir_select on public.social_index_requests
    for select to authenticated using (true);
create policy sir_insert on public.social_index_requests
    for insert to authenticated with check (true);
create policy sir_update on public.social_index_requests
    for update to authenticated using (true) with check (true);
create policy sir_delete on public.social_index_requests
    for delete to authenticated using (true);

-- --- social_index_appeals ---
drop policy if exists sap_select on public.social_index_appeals;
drop policy if exists sap_insert on public.social_index_appeals;
drop policy if exists sap_update on public.social_index_appeals;
drop policy if exists sap_delete on public.social_index_appeals;

create policy sap_select on public.social_index_appeals
    for select to authenticated using (true);
create policy sap_insert on public.social_index_appeals
    for insert to authenticated with check (true);
create policy sap_update on public.social_index_appeals
    for update to authenticated using (true) with check (true);
create policy sap_delete on public.social_index_appeals
    for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 7. FAYL OMBORI
--
--    YOPIQ: bu shaxsiy hujjatlar (pasport nusxasi, sertifikat). Ular ochiq
--    internetda turmasligi kerak - fayl faqat vaqtinchalik imzolangan
--    havola orqali ochiladi.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('student-documents', 'student-documents', false)
on conflict (id) do nothing;

drop policy if exists student_documents_files_read   on storage.objects;
drop policy if exists student_documents_files_write  on storage.objects;
drop policy if exists student_documents_files_delete on storage.objects;

create policy student_documents_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'student-documents');

create policy student_documents_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'student-documents');

create policy student_documents_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'student-documents');

-- ---------------------------------------------------------------------------
-- 8. TEKSHIRUV
-- ---------------------------------------------------------------------------
select
    (select count(*) from public.student_documents)         as hujjatlar,
    (select count(*) from public.social_index_evidence)     as dalillar,
    (select count(*) from public.social_index_assessments)  as baholar,
    (select count(*) from public.social_index_requests)     as sorovlar,
    (select count(*) from public.social_index_appeals)      as etirozlar;
