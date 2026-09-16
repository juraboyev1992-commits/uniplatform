-- =====================================================================
-- JONLI BAZADAGI RLS QOIDALARI - 2-QISM (s...z jadvallari)
--
-- 2026-09-16 da jonli bazadan chiqarildi. 1-qism: schema_live_policies.sql
--
-- OCHIQ QOLGAN ESKI QOIDALAR (shu faylda ikkitasi): `teams` va
-- `team_members` - ular Supabase panelida yaratilgan va sharti
-- `auth.role() = 'authenticated'`, ya'ni har qanday kirgan foydalanuvchi
-- istalgan jamoani tahrirlashi mumkin. `events`, `registrations` va
-- `registration_audit_logs` da ham xuddi shunday (1-qismda). Bular hali
-- toraytirilmagan - keyingi ish.
-- =====================================================================

create policy schapp_delete on public.scholarship_applications
    for delete to authenticated
    using (is_platform_admin());
create policy schapp_insert on public.scholarship_applications
    for insert to authenticated
    with check ((((student_id = current_username()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'doc_check'::text, 'evaluation'::text, 'committee'::text]))) OR is_platform_admin()));
create policy schapp_select on public.scholarship_applications
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_scholarship_evaluator() OR is_platform_admin()));
create policy schapp_update on public.scholarship_applications
    for update to authenticated
    using (((student_id = current_username()) OR is_scholarship_evaluator() OR is_platform_admin()))
    with check ((is_scholarship_evaluator() OR is_platform_admin() OR ((student_id = current_username()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'doc_check'::text, 'withdrawn'::text])))));

create policy scheval_select on public.scholarship_evaluations
    for select to authenticated
    using ((is_scholarship_evaluator() OR is_platform_admin()));
create policy scheval_write on public.scholarship_evaluations
    for all to authenticated
    using ((is_scholarship_evaluator() OR is_platform_admin()))
    with check ((is_scholarship_evaluator() OR is_platform_admin()));

create policy scholarship_grants_admin_delete on public.scholarship_grants
    for delete to authenticated
    using (is_platform_admin());
create policy scholarship_grants_admin_insert on public.scholarship_grants
    for insert to authenticated
    with check (is_platform_admin());
create policy scholarship_grants_admin_update on public.scholarship_grants
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy scholarship_grants_all_read on public.scholarship_grants
    for select to authenticated
    using (true);

-- scholarship_settings: yozish faqat adminga - aks holda talaba o'zini
-- baholovchi qilib yozib, barcha stipendiya hujjatlarini ocha olardi
-- (is_scholarship_evaluator() aynan shu jadvalni o'qiydi).
create policy scholarship_settings_admin_delete on public.scholarship_settings
    for delete to authenticated
    using (is_platform_admin());
create policy scholarship_settings_admin_insert on public.scholarship_settings
    for insert to authenticated
    with check (is_platform_admin());
create policy scholarship_settings_admin_update on public.scholarship_settings
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy scholarship_settings_all_read on public.scholarship_settings
    for select to authenticated
    using (true);

create policy social_apps_all_read on public.social_activity_applications
    for select to authenticated
    using (true);
create policy social_apps_w_delete on public.social_activity_applications
    for delete to authenticated
    using (is_staff());
create policy social_apps_w_insert on public.social_activity_applications
    for insert to authenticated
    with check ((is_staff() OR ((student_id = current_username()) AND (status = 'Pending'::text))));
create policy social_apps_w_update on public.social_activity_applications
    for update to authenticated
    using ((is_staff() OR (student_id = current_username())))
    with check ((is_staff() OR ((student_id = current_username()) AND (status = 'Pending'::text))));

create policy social_activity_audit_logs_append on public.social_activity_audit_logs
    for insert to authenticated
    with check (true);
create policy social_logs_all_read on public.social_activity_audit_logs
    for select to authenticated
    using (true);

create policy criteria_cat_all_read on public.social_criteria_categories
    for select to authenticated
    using (true);
create policy social_criteria_categories_admin_delete on public.social_criteria_categories
    for delete to authenticated
    using (is_platform_admin());
create policy social_criteria_categories_admin_insert on public.social_criteria_categories
    for insert to authenticated
    with check (is_platform_admin());
create policy social_criteria_categories_admin_update on public.social_criteria_categories
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy criteria_subcat_all_read on public.social_criteria_subcategories
    for select to authenticated
    using (true);
create policy social_criteria_subcategories_admin_delete on public.social_criteria_subcategories
    for delete to authenticated
    using (is_platform_admin());
create policy social_criteria_subcategories_admin_insert on public.social_criteria_subcategories
    for insert to authenticated
    with check (is_platform_admin());
create policy social_criteria_subcategories_admin_update on public.social_criteria_subcategories
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sap_insert on public.social_index_appeals
    for insert to authenticated
    with check ((((student_id = current_username()) AND (status = 'pending'::text)) OR is_platform_admin()));
create policy sap_select on public.social_index_appeals
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy sap_update on public.social_index_appeals
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sias_select on public.social_index_assessments
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy sias_write on public.social_index_assessments
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sie_delete on public.social_index_evidence
    for delete to authenticated
    using ((((student_id = current_username()) AND (status = 'pending'::text)) OR is_platform_admin()));
create policy sie_insert on public.social_index_evidence
    for insert to authenticated
    with check ((((student_id = current_username()) AND (status = 'pending'::text)) OR is_platform_admin()));
create policy sie_select on public.social_index_evidence
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy sie_update on public.social_index_evidence
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sipen_select on public.social_index_penalties
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy sipen_write on public.social_index_penalties
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sireq_delete on public.social_index_requests
    for delete to authenticated
    using (((student_id = current_username()) OR is_platform_admin()));
create policy sireq_insert on public.social_index_requests
    for insert to authenticated
    with check (((student_id = current_username()) OR is_platform_admin()));
create policy sireq_select on public.social_index_requests
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));

create policy social_score_transactions_w_delete on public.social_score_transactions
    for delete to authenticated
    using ((is_staff() OR is_club_officer_any()));
create policy social_score_transactions_w_insert on public.social_score_transactions
    for insert to authenticated
    with check ((is_staff() OR is_club_officer_any()));
create policy social_score_transactions_w_update on public.social_score_transactions
    for update to authenticated
    using ((is_staff() OR is_club_officer_any()))
    with check ((is_staff() OR is_club_officer_any()));
create policy sst_all_read on public.social_score_transactions
    for select to authenticated
    using (true);

create policy scoring_sources_all_read on public.social_scoring_sources
    for select to authenticated
    using (true);
create policy social_scoring_sources_admin_delete on public.social_scoring_sources
    for delete to authenticated
    using (is_platform_admin());
create policy social_scoring_sources_admin_insert on public.social_scoring_sources
    for insert to authenticated
    with check (is_platform_admin());
create policy social_scoring_sources_admin_update on public.social_scoring_sources
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

-- Xulq bayrog'ini tyutor (is_staff) yoki yotoqxona mudiri yozadi -
-- mudir alohida rol emas, u dormitories.responsible_user_id da turadi.
create policy scf_all_read on public.sport_conduct_flags
    for select to authenticated
    using (true);
create policy sport_flags_w_delete on public.sport_conduct_flags
    for delete to authenticated
    using (is_staff());
create policy sport_flags_w_insert on public.sport_conduct_flags
    for insert to authenticated
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM dormitories d
  WHERE (d.responsible_user_id = current_username())))));
create policy sport_flags_w_update on public.sport_conduct_flags
    for update to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM dormitories d
  WHERE (d.responsible_user_id = current_username())))))
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM dormitories d
  WHERE (d.responsible_user_id = current_username())))));

create policy sport_nom_w_delete on public.sport_team_nominations
    for delete to authenticated
    using ((is_staff() OR is_club_officer_any()));
create policy sport_nom_w_insert on public.sport_team_nominations
    for insert to authenticated
    with check ((is_staff() OR is_club_officer_any() OR ((student_id = current_username()) AND (status = 'pending'::text))));
create policy sport_nom_w_update on public.sport_team_nominations
    for update to authenticated
    using ((is_staff() OR is_club_officer_any()))
    with check ((is_staff() OR is_club_officer_any()));
create policy stn_all_read on public.sport_team_nominations
    for select to authenticated
    using (true);

create policy sport_teams_w_delete on public.sport_teams
    for delete to authenticated
    using (is_staff());
create policy sport_teams_w_insert on public.sport_teams
    for insert to authenticated
    with check (is_staff());
create policy sport_teams_w_update on public.sport_teams
    for update to authenticated
    using (is_staff())
    with check (is_staff());
create policy st_all_read on public.sport_teams
    for select to authenticated
    using (true);

create policy sdoc_select on public.student_documents
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_scholarship_evaluator() OR is_platform_admin()));
create policy sdoc_write on public.student_documents
    for all to authenticated
    using (((student_id = current_username()) OR is_platform_admin()))
    with check (((student_id = current_username()) OR is_platform_admin()));

create policy seh_select on public.student_enrollment_history
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy seh_write on public.student_enrollment_history
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy sh_all_read on public.student_housing
    for select to authenticated
    using (true);
create policy student_housing_w_delete on public.student_housing
    for delete to authenticated
    using (is_platform_admin());
create policy student_housing_w_insert on public.student_housing
    for insert to authenticated
    with check (is_platform_admin());
create policy student_housing_w_update on public.student_housing
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy som_all_read on public.student_opportunity_matches
    for select to authenticated
    using (true);
create policy som_w_delete on public.student_opportunity_matches
    for delete to authenticated
    using (is_staff());
create policy som_w_insert on public.student_opportunity_matches
    for insert to authenticated
    with check (is_staff());
create policy som_w_update on public.student_opportunity_matches
    for update to authenticated
    using (is_staff())
    with check (is_staff());

create policy sp_select on public.student_passport
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy sp_write on public.student_passport
    for all to authenticated
    using (((student_id = current_username()) OR is_platform_admin()))
    with check (((student_id = current_username()) OR is_platform_admin()));

-- student_recognitions: INSERT ATAYLAB ochiq - taklifni kirita olish
-- kerak; tahrirlash esa faqat o'z 'pending' yozuviga. Tasdiqlashni
-- review_student_recognition() (security definer) bajaradi.
create policy student_recognitions_delete_own_pending on public.student_recognitions
    for delete to public
    using (((proposed_by = current_username()) AND (status = 'pending'::text)));
create policy student_recognitions_insert on public.student_recognitions
    for insert to public
    with check (true);
create policy student_recognitions_select on public.student_recognitions
    for select to public
    using (true);
create policy student_recognitions_update_own_pending on public.student_recognitions
    for update to public
    using (((proposed_by = current_username()) AND (status = 'pending'::text)))
    with check ((status = 'pending'::text));

create policy tasg_select on public.talent_assignments
    for select to authenticated
    using (((student_id = current_username()) OR (person_id = current_username()) OR is_platform_admin()));
create policy tasg_write on public.talent_assignments
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy tlog_insert on public.talent_audit_logs
    for insert to authenticated
    with check (true);
create policy tlog_select on public.talent_audit_logs
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));

create policy talent_goals_select on public.talent_goals
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy talent_goals_write on public.talent_goals
    for all to authenticated
    using ((is_assigned_person_of(student_id) OR is_platform_admin()))
    with check ((is_assigned_person_of(student_id) OR is_platform_admin()));

create policy talent_idps_select on public.talent_idps
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy talent_idps_write on public.talent_idps
    for all to authenticated
    using ((is_assigned_person_of(student_id) OR is_platform_admin()))
    with check ((is_assigned_person_of(student_id) OR is_platform_admin()));

create policy talent_monitoring_select on public.talent_monitoring
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy talent_monitoring_write on public.talent_monitoring
    for all to authenticated
    using ((is_assigned_person_of(student_id) OR is_platform_admin()))
    with check ((is_assigned_person_of(student_id) OR is_platform_admin()));

create policy talent_profiles_select on public.talent_profiles
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy talent_profiles_write on public.talent_profiles
    for all to authenticated
    using ((is_assigned_person_of(student_id) OR is_platform_admin()))
    with check ((is_assigned_person_of(student_id) OR is_platform_admin()));

create policy talent_targets_select on public.talent_targets
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy talent_targets_write on public.talent_targets
    for all to authenticated
    using ((is_assigned_person_of(student_id) OR is_platform_admin()))
    with check ((is_assigned_person_of(student_id) OR is_platform_admin()));

-- ESKI QOIDALAR (Supabase panelida yaratilgan): jamoalarni har qanday
-- kirgan foydalanuvchi tahrirlay oladi. Toraytirilmagan - keyingi ish.
create policy "authenticated read/write team_members" on public.team_members
    for all to public
    using ((auth.role() = 'authenticated'::text))
    with check ((auth.role() = 'authenticated'::text));
create policy "authenticated read/write teams" on public.teams
    for all to public
    using ((auth.role() = 'authenticated'::text))
    with check ((auth.role() = 'authenticated'::text));

-- test_attempts: o'qish ochiq (reyting), yozish faqat o'z urinishiga.
create policy test_attempts_all_read on public.test_attempts
    for select to authenticated
    using (true);
create policy test_attempts_own_or_staff_read on public.test_attempts
    for select to authenticated
    using (((student_id = current_username()) OR is_staff()));
create policy test_attempts_w_delete on public.test_attempts
    for delete to authenticated
    using (((student_id = current_username()) OR is_staff()));
create policy test_attempts_w_insert on public.test_attempts
    for insert to authenticated
    with check (((student_id = current_username()) OR is_staff()));
create policy test_attempts_w_update on public.test_attempts
    for update to authenticated
    using (((student_id = current_username()) OR is_staff()))
    with check (((student_id = current_username()) OR is_staff()));

-- DIQQAT: test_questions ni O'QISH ochiq - ya'ni to'g'ri javoblar
-- talabaning brauzeriga yuklanadi. Buni RLS hal qilmaydi; baholash
-- Postgres funksiyasiga ko'chirilishi kerak.
create policy test_questions_all_read on public.test_questions
    for select to authenticated
    using (true);
create policy test_questions_w_delete on public.test_questions
    for delete to authenticated
    using (is_platform_admin());
create policy test_questions_w_insert on public.test_questions
    for insert to authenticated
    with check (is_platform_admin());
create policy test_questions_w_update on public.test_questions
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy tests_all_read on public.tests
    for select to authenticated
    using (true);
create policy tests_w_delete on public.tests
    for delete to authenticated
    using (is_platform_admin());
create policy tests_w_insert on public.tests
    for insert to authenticated
    with check (is_platform_admin());
create policy tests_w_update on public.tests
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy tutor_group_assignments_select on public.tutor_group_assignments
    for select to public
    using (true);
create policy tutor_group_assignments_write on public.tutor_group_assignments
    for all to public
    using (is_platform_admin())
    with check (is_platform_admin());

create policy venues_admin_delete on public.venues
    for delete to authenticated
    using (is_platform_admin());
create policy venues_admin_insert on public.venues
    for insert to authenticated
    with check (is_platform_admin());
create policy venues_admin_update on public.venues
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy venues_rw_read on public.venues
    for select to authenticated
    using (true);
