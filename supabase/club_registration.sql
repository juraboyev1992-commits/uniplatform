-- ===========================================================================
-- KLUB TASHKIL ETISH VA RASMIYLASHTIRISH
--
-- Mavjud `clubs` jadvaliga BIRORTA HAM ustun QO'SHILMAYDI - uning bazaviy
-- sxemasi bu sessiyalardan oldingi va repoda SQL fayli yo'q, shuning uchun
-- unga ALTER TABLE qilish xavfli. Yangi holat maydonlari (registrationStatus,
-- registryNumber, createdFrom, createdBy, applicationId, operationalStatus)
-- allaqachon mavjud `clubs.data jsonb` konventsiyasi orqali qo'shiladi -
-- xuddi contacts/shortName/status/joinPolicy kabi (club_contacts.sql,
-- club_media.sql). Mavjud klub yozuvi buzilmaydi.
--
-- BEShTA YANGI JADVAL:
--   club_applications         - talaba/tashabbuskor arizasi
--   club_application_reviews  - ariza bo'yicha har bir qaror (audit, faqat insert)
--   club_regulations          - klub nizomi (11 band, draft/revision/approved)
--   club_certificates         - berilgan guvohnomalar
--   club_status_history       - registratsiya VA faoliyat holati o'zgarishlari (audit)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ARIZALAR
-- ---------------------------------------------------------------------------
create table if not exists public.club_applications (
    id                text primary key,
    applicant_user_id text not null,
    status            text not null default 'DRAFT',
    data              jsonb not null default '{}'::jsonb,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists club_applications_applicant_idx on public.club_applications (applicant_user_id);
create index if not exists club_applications_status_idx on public.club_applications (status);

create table if not exists public.club_application_reviews (
    id             text primary key,
    application_id text not null references public.club_applications(id) on delete cascade,
    from_status    text,
    to_status      text not null,
    action         text not null,
    comment        text not null default '',
    reviewed_by    text not null,
    created_at     timestamptz not null default now()
);
create index if not exists club_application_reviews_app_idx on public.club_application_reviews (application_id);

-- ---------------------------------------------------------------------------
-- 2. NIZOM
--
-- Har klub/ariza uchun BITTA joriy yozuv (upsert orqali yangilanadi) - band
-- 9 dagi draft/revision/approved holatlari shu yozuvning o'zida, alohida
-- versiyalar jadvali emas: nizom tez-tez tahrirlanadi va har tahrirni
-- alohida qator qilish keraksiz og'irlik bo'lardi.
-- ---------------------------------------------------------------------------
create table if not exists public.club_regulations (
    id             text primary key,
    club_id        text,
    application_id text references public.club_applications(id) on delete set null,
    status         text not null default 'draft',
    sections       jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists club_regulations_club_idx on public.club_regulations (club_id);
create index if not exists club_regulations_application_idx on public.club_regulations (application_id);

-- ---------------------------------------------------------------------------
-- 3. GUVOHNOMALAR
-- ---------------------------------------------------------------------------
create table if not exists public.club_certificates (
    id                  text primary key,
    club_id             text not null,
    certificate_number  text not null unique,
    registry_number     text not null,
    status              text not null default 'active',
    issued_by           text not null,
    issued_at           timestamptz not null default now(),
    revoked_at          timestamptz,
    revoked_reason      text,
    -- "Asos hujjati": buyruq/qaror raqami, sanasi - klub NIMA asosida
    -- rasmiylashtirilganini ko'rsatadi (band 17).
    basis_document      jsonb not null default '{}'::jsonb
);
create index if not exists club_certificates_club_idx on public.club_certificates (club_id);

-- ---------------------------------------------------------------------------
-- 4. HOLAT TARIXI (registratsiya VA faoliyat, ikkalasi ham)
-- ---------------------------------------------------------------------------
create table if not exists public.club_status_history (
    id          text primary key,
    club_id     text not null,
    status_kind text not null,       -- 'registration' | 'operational'
    from_status text,
    to_status   text not null,
    reason      text not null default '',
    actor       text not null,
    created_at  timestamptz not null default now()
);
create index if not exists club_status_history_club_idx on public.club_status_history (club_id);

-- ---------------------------------------------------------------------------
-- 5. RUXSATLAR
--
-- `is_platform_admin()` va `current_username()` avvalgi bosqichda
-- yaratilgan (supabase/club_membership_policy.sql,
-- supabase/storage_privacy_student_documents.sql). Ular ishga tushirilmagan
-- bo'lsa, avval o'shalarni ishga tushiring.
-- ---------------------------------------------------------------------------
alter table public.club_applications        enable row level security;
alter table public.club_application_reviews enable row level security;
alter table public.club_regulations         enable row level security;
alter table public.club_certificates        enable row level security;
alter table public.club_status_history       enable row level security;

drop policy if exists club_applications_select on public.club_applications;
drop policy if exists club_applications_insert on public.club_applications;
drop policy if exists club_applications_update on public.club_applications;

-- O'qish: o'z arizasini yozgan odam va administrator. Boshqa talabaning
-- "Yangi klub tashkil etish" arizasi shaxsiy tashabbus - ommaga ochiq emas.
create policy club_applications_select on public.club_applications
    for select to authenticated
    using (public.is_platform_admin() or applicant_user_id = public.current_username());

create policy club_applications_insert on public.club_applications
    for insert to authenticated
    with check (applicant_user_id = public.current_username());

-- Yangilash: administrator har qanday holatga o'tkaza oladi. Tashabbuskor
-- FAQAT o'z arizasiga tegadi VA faqat O'Z-O'ZIGA XIZMAT holatlariga
-- o'tkaza/qoldira oladi:
--   DRAFT, REVISION_REQUIRED - matn tahrirlanadi, status o'zgarmaydi
--   SUBMITTED, RESUBMITTED   - "yuborish"/"qayta yuborish" o'tishi
-- UNDER_REVIEW/EXPERT_REVIEW/PENDING_APPROVAL/APPROVED/REJECTED - FAQAT
-- administrator yoza oladi (band 23: "Backend ham RBAC orqali qat'iy
-- himoyalangan bo'lishi shart" - frontendni yashirish yetarli emas).
-- Bosqichlarning to'liq grafigi (masalan REVISION_REQUIRED dan keyingina
-- RESUBMITTED bo'lishi) KODDA tekshiriladi (db.reviewClubApplication); bu
-- yerdagi qoida - kim NIMA yoza olishining so'nggi chegarasi.
create policy club_applications_update on public.club_applications
    for update to authenticated
    using (public.is_platform_admin() or applicant_user_id = public.current_username())
    with check (
        public.is_platform_admin()
        or (
            applicant_user_id = public.current_username()
            and status in ('DRAFT', 'REVISION_REQUIRED', 'SUBMITTED', 'RESUBMITTED')
        )
    );

drop policy if exists club_application_reviews_select on public.club_application_reviews;
drop policy if exists club_application_reviews_insert on public.club_application_reviews;

create policy club_application_reviews_select on public.club_application_reviews
    for select to authenticated
    using (
        public.is_platform_admin()
        or exists (
            select 1 from public.club_applications a
            where a.id = application_id and a.applicant_user_id = public.current_username()
        )
    );

-- Odatda FAQAT administrator qaror yozadi (audit yaxlitligi - tashabbuskor
-- o'z arizasiga "tasdiqlandi" deb yoza olmasligi kerak). ISTISNO: "submit" va
-- "resubmit" - bular ADMIN QARORI emas, talabaning O'Z harakati (arizani
-- yuborish/qayta yuborish). Ularni ham shu jadvalga yozish kerak, chunki
-- band 12 "har bir qaror audit qilinsin" ariza tarixini TO'LIQ ko'rsatishni
-- talab qiladi - faqat admin qarorlarini emas.
create policy club_application_reviews_insert on public.club_application_reviews
    for insert to authenticated
    with check (
        public.is_platform_admin()
        or (
            action in ('submit', 'resubmit')
            and reviewed_by = public.current_username()
            and exists (
                select 1 from public.club_applications a
                where a.id = application_id and a.applicant_user_id = public.current_username()
            )
        )
    );

drop policy if exists club_regulations_select on public.club_regulations;
drop policy if exists club_regulations_upsert on public.club_regulations;

-- Nizom klub sahifasida ko'rinadi - bu yopiq ma'lumot emas.
create policy club_regulations_select on public.club_regulations
    for select to authenticated
    using (true);

-- Yozish: administrator (klub nizomi uchun) VA arizaning O'Z egasi (band 9 -
-- talaba nizom loyihasini o'zi to'ldiradi, ariza hali ko'rib chiqilayotgan
-- payt). `ClubRegulationEditor.jsx` ikkalasidan ham chaqiriladi - JS
-- tomonidagi `canEdit`/`canApprove` faqat interfeys, haqiqiy chegara shu
-- yerda. TASDIQLASH (`status = 'approved'`) esa FAQAT administrator -
-- talaba o'z nizomini o'zi tasdiqlay olmasligi kerak.
create policy club_regulations_upsert on public.club_regulations
    for all to authenticated
    using (
        public.is_platform_admin()
        or exists (
            select 1 from public.club_applications a
            where a.id = application_id and a.applicant_user_id = public.current_username()
        )
    )
    with check (
        public.is_platform_admin()
        or (
            status <> 'approved'
            and exists (
                select 1 from public.club_applications a
                where a.id = application_id and a.applicant_user_id = public.current_username()
            )
        )
    );

drop policy if exists club_certificates_select on public.club_certificates;
drop policy if exists club_certificates_insert on public.club_certificates;

create policy club_certificates_select on public.club_certificates
    for select to authenticated
    using (true);

create policy club_certificates_insert on public.club_certificates
    for insert to authenticated
    with check (public.is_platform_admin());

drop policy if exists club_status_history_select on public.club_status_history;
drop policy if exists club_status_history_insert on public.club_status_history;

create policy club_status_history_select on public.club_status_history
    for select to authenticated
    using (true);

create policy club_status_history_insert on public.club_status_history
    for insert to authenticated
    with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. RO'YXATGA OLISH VA GUVOHNOMA - HAQIQIY BACKEND CHEGARASI
--
-- MUAMMO: `clubs` jadvalining UPDATE siyosati bu sessiyalardan oldingi va
-- fayli repoda yo'q - uning aniq qoidasi noma'lum (masalan, klub
-- koordinatori o'z klubini tahrirlay olishi ma'lum, ClubProfilePage.jsx
-- izohiga ko'ra). Agar `registerClub`/`issueClubCertificate` oddiy
-- `update clubs set data = ...` orqali ishlasa va koordinatorga `data`
-- ustunini yozish ruxsat etilgan bo'lsa - koordinator (roli TALABA bo'lib
-- qoladi) o'z klubini ADMINSIZ "ro'yxatdan o'tgan" deb belgilab qo'yishi
-- mumkin bo'lardi. Bu band 3 ning butun maqsadini buzardi.
--
-- YECHIM: ikkala amal ham shu ikki SECURITY DEFINER funksiya orqali
-- o'tadi - ular `clubs` jadvalining RLS siyosatidan MUSTAQIL, o'zlari
-- `is_platform_admin()` ni tekshiradi va rad etsa xato qaytaradi. Bu
-- platformada allaqachon qabul qilingan naqsh (`verify_club`,
-- `next_doc_number` ham shunday).
-- ---------------------------------------------------------------------------
create or replace function public.admin_register_club(
    p_club_id text, p_registry_number text, p_registered_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Faqat administrator klubni ro''yxatdan o''tkaza oladi';
    end if;
    update public.clubs
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'registrationStatus', 'REGISTERED',
        'registryNumber', p_registry_number,
        'registeredAt', to_jsonb(p_registered_at)
    )
    where id = p_club_id;
end;
$$;

create or replace function public.admin_issue_club_certificate(p_club_id text, p_certificate_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Faqat administrator guvohnoma bera oladi';
    end if;
    update public.clubs
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'certificateNumber', p_certificate_number,
        'operationalStatus', 'ACTIVE'
    )
    where id = p_club_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. OCHIQ TEKSHIRUV (QR)
--
-- DocumentVerifyPage.jsx ning `verify_document` RPC'siga o'xshash naqsh:
-- xom `clubs`/`club_certificates` jadvali tashqi foydalanuvchiga OCHILMAYDI,
-- faqat shu funksiya va faqat xavfsiz maydonlar. Login talab qilinmaydi -
-- shuning uchun `security definer` va faqat kerakli ustunlar tanlangan.
-- ---------------------------------------------------------------------------
create or replace function public.verify_club(p_registry_number text)
returns table (
    registry_number      text,
    club_name            text,
    club_type            text,
    direction            text,
    registration_status  text,
    registered_at        timestamptz,
    certificate_number   text,
    certificate_status   text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.data->>'registryNumber',
        c.name,
        c.data->>'clubType',
        c.category,
        c.data->>'registrationStatus',
        (c.data->>'registeredAt')::timestamptz,
        cert.certificate_number,
        cert.status
    from public.clubs c
    left join lateral (
        select certificate_number, status
        from public.club_certificates
        where club_id = c.id
        order by issued_at desc
        limit 1
    ) cert on true
    where c.data->>'registryNumber' = p_registry_number
$$;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select count(*) as arizalar from public.club_applications;
