-- =====================================================================
-- JONLI BAZADAGI BARCHA RLS QOIDALARI (public sxemasi)
--
-- 2026-09-16 da jonli bazadan chiqarildi (_sxema_chiqarish_2.sql,
-- bolim 3, 4, 5). Jadval nomi bo'yicha tartiblangan.
--
-- 1-QISM: a...r bilan boshlanadigan jadvallar.
-- 2-qism (s...z) alohida faylda: schema_live_policies_2.sql
--
-- ISHGA TUSHIRISH TARTIBI yangi bazada:
--   1. schema_live_tables.sql + schema_live_tables_2.sql
--   2. schema_live_functions.sql
--   3. schema_live_triggers.sql
--   4. shu fayl + schema_live_policies_2.sql
-- Har bir jadvalda oldin `alter table ... enable row level security`
-- bajarilishi kerak - aks holda qoidalar ishlamaydi.
-- =====================================================================

create policy acr_select on public.academic_records
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy acr_write on public.academic_records
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy aa_all_read on public.activity_attendance
    for select to authenticated
    using (true);
create policy activity_attendance_w_delete on public.activity_attendance
    for delete to authenticated
    using (can_manage_activity(activity_type, activity_id));
create policy activity_attendance_w_insert on public.activity_attendance
    for insert to authenticated
    with check (can_manage_activity(activity_type, activity_id));
create policy activity_attendance_w_update on public.activity_attendance
    for update to authenticated
    using (can_manage_activity(activity_type, activity_id))
    with check (can_manage_activity(activity_type, activity_id));

create policy aaal_all_read on public.activity_attendance_audit_logs
    for select to authenticated
    using (true);
create policy activity_attendance_audit_logs_append on public.activity_attendance_audit_logs
    for insert to authenticated
    with check (true);
create policy activity_attendance_audit_logs_staff_delete on public.activity_attendance_audit_logs
    for delete to authenticated
    using (is_staff());

create policy aal_all_read on public.activity_attendance_locks
    for select to authenticated
    using (true);
create policy activity_attendance_locks_w_delete on public.activity_attendance_locks
    for delete to authenticated
    using (can_manage_activity(activity_type, activity_id));
create policy activity_attendance_locks_w_insert on public.activity_attendance_locks
    for insert to authenticated
    with check (can_manage_activity(activity_type, activity_id));
create policy activity_attendance_locks_w_update on public.activity_attendance_locks
    for update to authenticated
    using (can_manage_activity(activity_type, activity_id))
    with check (can_manage_activity(activity_type, activity_id));

create policy activity_reports_w_delete on public.activity_reports
    for delete to authenticated
    using (can_manage_activity(activity_type, activity_id));
create policy activity_reports_w_insert on public.activity_reports
    for insert to authenticated
    with check (can_manage_activity(activity_type, activity_id));
create policy activity_reports_w_update on public.activity_reports
    for update to authenticated
    using (can_manage_activity(activity_type, activity_id))
    with check (can_manage_activity(activity_type, activity_id));
create policy ar_all_read on public.activity_reports
    for select to authenticated
    using (true);

create policy activity_tasks_w_delete on public.activity_tasks
    for delete to authenticated
    using (can_manage_activity(activity_type, activity_id));
create policy activity_tasks_w_insert on public.activity_tasks
    for insert to authenticated
    with check (can_manage_activity(activity_type, activity_id));
create policy activity_tasks_w_update on public.activity_tasks
    for update to authenticated
    using ((can_manage_activity(activity_type, activity_id) OR (assignee_id = current_username())))
    with check ((can_manage_activity(activity_type, activity_id) OR (assignee_id = current_username())));
create policy at_all_read on public.activity_tasks
    for select to authenticated
    using (true);

create policy award_batches_rw_read on public.award_batches
    for select to authenticated
    using (true);
create policy award_batches_w_delete on public.award_batches
    for delete to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = award_batches.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy award_batches_w_insert on public.award_batches
    for insert to authenticated
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = award_batches.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy award_batches_w_update on public.award_batches
    for update to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = award_batches.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))))
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = award_batches.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));

create policy award_rules_admin_delete on public.award_rules
    for delete to authenticated
    using (is_platform_admin());
create policy award_rules_admin_insert on public.award_rules
    for insert to authenticated
    with check (is_platform_admin());
create policy award_rules_admin_update on public.award_rules
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy award_rules_rw_read on public.award_rules
    for select to authenticated
    using (true);

create policy club_ach_w_delete on public.club_achievements
    for delete to authenticated
    using ((is_platform_admin() OR ((data ->> 'submittedBy'::text) = current_username())));
create policy club_ach_w_insert on public.club_achievements
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id) OR ((data ->> 'submittedBy'::text) = current_username())));
create policy club_ach_w_update on public.club_achievements
    for update to authenticated
    using ((is_platform_admin() OR ((data ->> 'submittedBy'::text) = current_username())))
    with check ((is_platform_admin() OR ((data ->> 'submittedBy'::text) = current_username())));
create policy club_achievements_select on public.club_achievements
    for select to authenticated
    using (true);

create policy club_application_reviews_insert on public.club_application_reviews
    for insert to authenticated
    with check ((is_platform_admin() OR ((action = ANY (ARRAY['submit'::text, 'resubmit'::text])) AND (reviewed_by = current_username()) AND (EXISTS ( SELECT 1
   FROM club_applications a
  WHERE ((a.id = club_application_reviews.application_id) AND (a.applicant_user_id = current_username())))))));
create policy club_application_reviews_select on public.club_application_reviews
    for select to authenticated
    using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM club_applications a
  WHERE ((a.id = club_application_reviews.application_id) AND (a.applicant_user_id = current_username()))))));

create policy club_applications_insert on public.club_applications
    for insert to authenticated
    with check ((applicant_user_id = current_username()));
create policy club_applications_select on public.club_applications
    for select to authenticated
    using ((is_platform_admin() OR (applicant_user_id = current_username())));
create policy club_applications_update on public.club_applications
    for update to authenticated
    using ((is_platform_admin() OR (applicant_user_id = current_username())))
    with check ((is_platform_admin() OR ((applicant_user_id = current_username()) AND (status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUIRED'::text, 'SUBMITTED'::text, 'RESUBMITTED'::text])))));

create policy club_certificates_insert on public.club_certificates
    for insert to authenticated
    with check (is_platform_admin());
create policy club_certificates_select on public.club_certificates
    for select to authenticated
    using (true);

create policy club_docs_w_delete on public.club_documents
    for delete to authenticated
    using ((is_staff() OR is_club_officer(club_id)));
create policy club_docs_w_insert on public.club_documents
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id)));
create policy club_docs_w_update on public.club_documents
    for update to authenticated
    using ((is_staff() OR is_club_officer(club_id)))
    with check ((is_staff() OR is_club_officer(club_id)));
create policy club_documents_select on public.club_documents
    for select to authenticated
    using (true);

create policy club_join_requests_select on public.club_join_requests
    for select to authenticated
    using (true);
create policy club_join_w_delete on public.club_join_requests
    for delete to authenticated
    using ((is_staff() OR is_club_officer(club_id)));
create policy club_join_w_insert on public.club_join_requests
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id) OR (user_id = (auth.uid())::text) OR (user_id = current_username())));
create policy club_join_w_update on public.club_join_requests
    for update to authenticated
    using ((is_staff() OR is_club_officer(club_id)))
    with check ((is_staff() OR is_club_officer(club_id)));

create policy club_membership_events_select on public.club_membership_events
    for select to authenticated
    using (true);
create policy club_mevents_append on public.club_membership_events
    for insert to authenticated
    with check (true);

create policy club_pos_apps_all_read on public.club_position_applications
    for select to authenticated
    using (true);
create policy club_pos_apps_w_delete on public.club_position_applications
    for delete to authenticated
    using ((is_staff() OR is_club_officer(club_id)));
create policy club_pos_apps_w_insert on public.club_position_applications
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id) OR ((student_id = current_username()) AND (status = 'PENDING'::text))));
create policy club_pos_apps_w_update on public.club_position_applications
    for update to authenticated
    using ((is_staff() OR is_club_officer(club_id) OR (student_id = current_username())))
    with check ((is_staff() OR is_club_officer(club_id) OR ((student_id = current_username()) AND (status = ANY (ARRAY['PENDING'::text, 'CANCELLED'::text])))));

create policy club_pos_asg_w_delete on public.club_position_assignments
    for delete to authenticated
    using ((is_staff() OR is_club_officer(club_id)));
create policy club_pos_asg_w_insert on public.club_position_assignments
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id)));
create policy club_pos_asg_w_update on public.club_position_assignments
    for update to authenticated
    using ((is_staff() OR is_club_officer(club_id)))
    with check ((is_staff() OR is_club_officer(club_id)));
create policy club_position_assignments_all_read on public.club_position_assignments
    for select to authenticated
    using (true);

create policy club_pos_logs_all_read on public.club_position_audit_logs
    for select to authenticated
    using (true);
create policy club_position_audit_logs_append on public.club_position_audit_logs
    for insert to authenticated
    with check (true);

create policy club_positions_all_read on public.club_positions
    for select to authenticated
    using (true);
create policy club_positions_w_delete on public.club_positions
    for delete to authenticated
    using ((is_staff() OR is_club_officer(club_id)));
create policy club_positions_w_insert on public.club_positions
    for insert to authenticated
    with check ((is_staff() OR is_club_officer(club_id)));
create policy club_positions_w_update on public.club_positions
    for update to authenticated
    using ((is_staff() OR is_club_officer(club_id)))
    with check ((is_staff() OR is_club_officer(club_id)));

create policy club_regulations_select on public.club_regulations
    for select to authenticated
    using (true);
create policy club_regulations_upsert on public.club_regulations
    for all to authenticated
    using ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM club_applications a
  WHERE ((a.id = club_regulations.application_id) AND (a.applicant_user_id = current_username()))))))
    with check ((is_platform_admin() OR ((status <> 'approved'::text) AND (EXISTS ( SELECT 1
   FROM club_applications a
  WHERE ((a.id = club_regulations.application_id) AND (a.applicant_user_id = current_username())))))));

create policy club_status_history_insert on public.club_status_history
    for insert to authenticated
    with check (is_platform_admin());
create policy club_status_history_select on public.club_status_history
    for select to authenticated
    using (true);

-- ESKI QOIDA (Supabase panelida yaratilgan): klublarni hamma o'qiydi,
-- yozishni esa admin - shart profiles jadvalidan to'g'ridan-to'g'ri
-- o'qiladi, is_platform_admin() emas.
create policy "clubs readable by everyone" on public.clubs
    for select to public
    using (true);
create policy "clubs writable by admins" on public.clubs
    for all to public
    using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'ADMINISTRATOR'::user_role)))));

create policy competition_advancement_results_select on public.competition_advancement_results
    for select to authenticated
    using (true);
create policy competition_advancement_results_write on public.competition_advancement_results
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_advancement_rules_select on public.competition_advancement_rules
    for select to authenticated
    using (true);
create policy competition_advancement_rules_write on public.competition_advancement_rules
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_appeal_audit_logs_insert on public.competition_appeal_audit_logs
    for insert to authenticated
    with check (true);
create policy competition_appeal_audit_logs_select on public.competition_appeal_audit_logs
    for select to authenticated
    using (true);

create policy compappeal_delete on public.competition_appeals
    for delete to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()));
create policy compappeal_insert on public.competition_appeals
    for insert to authenticated
    with check ((((data ->> 'submittedBy'::text) = current_username()) OR is_competition_judge(competition_id) OR is_platform_admin()));
create policy compappeal_select on public.competition_appeals
    for select to authenticated
    using (true);
create policy compappeal_update on public.competition_appeals
    for update to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_audit_logs_insert on public.competition_audit_logs
    for insert to authenticated
    with check (true);
create policy competition_audit_logs_select on public.competition_audit_logs
    for select to authenticated
    using (true);

create policy competition_case_roles_select on public.competition_case_roles
    for select to authenticated
    using (true);
create policy competition_case_roles_write on public.competition_case_roles
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_delegation_audit_logs_insert on public.competition_delegation_audit_logs
    for insert to authenticated
    with check (true);
create policy competition_delegation_audit_logs_select on public.competition_delegation_audit_logs
    for select to authenticated
    using (true);

create policy compdeleg_select on public.competition_delegations
    for select to authenticated
    using (true);
create policy compdeleg_write on public.competition_delegations
    for all to authenticated
    using ((is_competition_owner(competition_id) OR is_platform_admin()))
    with check ((is_competition_owner(competition_id) OR is_platform_admin()));

create policy competition_group_action_logs_insert on public.competition_group_action_logs
    for insert to authenticated
    with check (true);
create policy competition_group_action_logs_select on public.competition_group_action_logs
    for select to authenticated
    using (true);

create policy competition_groups_select on public.competition_groups
    for select to authenticated
    using (true);
create policy competition_groups_write on public.competition_groups
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_judge_roles_select on public.competition_judge_roles
    for select to authenticated
    using (true);
create policy competition_judge_roles_write on public.competition_judge_roles
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_matches_select on public.competition_matches
    for select to authenticated
    using (true);
create policy competition_matches_write on public.competition_matches
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_participant_groups_select on public.competition_participant_groups
    for select to authenticated
    using (true);
create policy competition_participant_groups_write on public.competition_participant_groups
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_participant_seats_select on public.competition_participant_seats
    for select to authenticated
    using (true);
create policy competition_participant_seats_write on public.competition_participant_seats
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_question_points_select on public.competition_question_points
    for select to authenticated
    using (true);
create policy competition_question_points_write on public.competition_question_points
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_round_participant_status_select on public.competition_round_participant_status
    for select to authenticated
    using (true);
create policy competition_round_participant_status_write on public.competition_round_participant_status
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_rounds_select on public.competition_rounds
    for select to authenticated
    using (true);
create policy competition_rounds_write on public.competition_rounds
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_scores_select on public.competition_scores
    for select to authenticated
    using (true);
create policy competition_scores_write on public.competition_scores
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_scoring_groups_select on public.competition_scoring_groups
    for select to authenticated
    using (true);
create policy competition_scoring_groups_write on public.competition_scoring_groups
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_tiebreak_resolutions_select on public.competition_tiebreak_resolutions
    for select to authenticated
    using (true);
create policy competition_tiebreak_resolutions_write on public.competition_tiebreak_resolutions
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy competition_tur_schedule_select on public.competition_tur_schedule
    for select to authenticated
    using (true);
create policy competition_tur_schedule_write on public.competition_tur_schedule
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

-- `comp_update` ATAYLAB ochiq: talaba ro'yxatdan o'tganda o'sha qatorga
-- yoziladi (ishtirokchilar competitions.data ichida). Maydonlarni
-- competitions_guard_core trigger qo'riqlaydi.
create policy comp_delete on public.competitions
    for delete to authenticated
    using ((is_competition_owner(id) OR is_platform_admin()));
create policy comp_insert on public.competitions
    for insert to authenticated
    with check ((((data ->> 'ownerUsername'::text) = current_username()) OR is_platform_admin()));
create policy comp_select on public.competitions
    for select to authenticated
    using (true);
create policy comp_update on public.competitions
    for update to authenticated
    using (true)
    with check (true);

create policy cp_all_read on public.cultural_places
    for select to authenticated
    using (true);
create policy cultural_places_admin_delete on public.cultural_places
    for delete to authenticated
    using (is_platform_admin());
create policy cultural_places_admin_insert on public.cultural_places
    for insert to authenticated
    with check (is_platform_admin());
create policy cultural_places_admin_update on public.cultural_places
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy cultural_visits_read on public.cultural_visits
    for select to authenticated
    using (((student_id = current_username()) OR is_staff()));
create policy cultural_visits_w_delete on public.cultural_visits
    for delete to authenticated
    using (is_staff());
create policy cultural_visits_w_insert on public.cultural_visits
    for insert to authenticated
    with check ((is_staff() OR (student_id = current_username())));
create policy cultural_visits_w_update on public.cultural_visits
    for update to authenticated
    using (is_staff())
    with check (is_staff());

create policy debate_match_best_speaker_picks_select on public.debate_match_best_speaker_picks
    for select to authenticated
    using (true);
create policy debate_match_best_speaker_picks_write on public.debate_match_best_speaker_picks
    for all to authenticated
    using ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_best_speaker_picks.match_id))) OR is_platform_admin()))
    with check ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_best_speaker_picks.match_id))) OR is_platform_admin()));

create policy debate_match_lineups_select on public.debate_match_lineups
    for select to authenticated
    using (true);
create policy debate_match_lineups_write on public.debate_match_lineups
    for all to authenticated
    using ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_lineups.match_id))) OR is_platform_admin()))
    with check ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_lineups.match_id))) OR is_platform_admin()));

create policy debate_match_notiq_scores_select on public.debate_match_notiq_scores
    for select to authenticated
    using (true);
create policy debate_match_notiq_scores_write on public.debate_match_notiq_scores
    for all to authenticated
    using ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_notiq_scores.match_id))) OR is_platform_admin()))
    with check ((is_competition_judge(( SELECT m.competition_id
   FROM debate_matches m
  WHERE (m.id = debate_match_notiq_scores.match_id))) OR is_platform_admin()));

create policy debate_matches_select on public.debate_matches
    for select to authenticated
    using (true);
create policy debate_matches_write on public.debate_matches
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy debate_penalties_select on public.debate_penalties
    for select to authenticated
    using (true);
create policy debate_penalties_write on public.debate_penalties
    for all to authenticated
    using ((is_competition_judge(competition_id) OR is_platform_admin()))
    with check ((is_competition_judge(competition_id) OR is_platform_admin()));

create policy disc_select on public.discipline_violations
    for select to authenticated
    using (((student_id = current_username()) OR is_assigned_person_of(student_id) OR is_platform_admin()));
create policy disc_write on public.discipline_violations
    for all to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy document_audit_logs_append on public.document_audit_logs
    for insert to authenticated
    with check (true);
create policy document_audit_logs_rw_read on public.document_audit_logs
    for select to authenticated
    using (true);

-- document_counters ga YOZISH qoidasi ATAYLAB yo'q: raqam faqat
-- next_doc_number() (security definer) orqali beriladi.
create policy document_counters_rw_read on public.document_counters
    for select to authenticated
    using (true);

create policy documents_rw_read on public.documents
    for select to authenticated
    using (true);
create policy documents_w_delete on public.documents
    for delete to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = documents.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy documents_w_insert on public.documents
    for insert to authenticated
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = documents.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy documents_w_update on public.documents
    for update to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = documents.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))))
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = documents.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));

create policy dorm_all_read on public.dormitories
    for select to authenticated
    using (true);
create policy dormitories_admin_delete on public.dormitories
    for delete to authenticated
    using (is_platform_admin());
create policy dormitories_admin_insert on public.dormitories
    for insert to authenticated
    with check (is_platform_admin());
create policy dormitories_admin_update on public.dormitories
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy event_collection_items_select on public.event_collection_items
    for select to public
    using (true);
create policy event_collection_items_write on public.event_collection_items
    for all to public
    using (is_platform_admin())
    with check (is_platform_admin());

create policy event_collections_select on public.event_collections
    for select to public
    using (true);
create policy event_collections_write on public.event_collections
    for all to public
    using (is_platform_admin())
    with check (is_platform_admin());

create policy event_delegations_all_read on public.event_delegations
    for select to authenticated
    using (true);
create policy event_delegations_w_delete on public.event_delegations
    for delete to authenticated
    using (is_platform_admin());
create policy event_delegations_w_insert on public.event_delegations
    for insert to authenticated
    with check (is_platform_admin());
create policy event_delegations_w_update on public.event_delegations
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

-- ESKI QOIDA (Supabase panelida yaratilgan): tadbirlarga har qanday
-- kirgan foydalanuvchi yoza oladi. Toraytirilishi kerak - hali
-- qilinmagan (registrations va registration_audit_logs ham shunday).
create policy "authenticated read/write events" on public.events
    for all to public
    using ((auth.role() = 'authenticated'::text))
    with check ((auth.role() = 'authenticated'::text));

create policy integration_settings_admin_delete on public.integration_settings
    for delete to authenticated
    using (is_platform_admin());
create policy integration_settings_admin_insert on public.integration_settings
    for insert to authenticated
    with check (is_platform_admin());
create policy integration_settings_admin_update on public.integration_settings
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy is_all_read on public.integration_settings
    for select to authenticated
    using (true);

create policy integration_sync_logs_append on public.integration_sync_logs
    for insert to authenticated
    with check (true);
create policy isl_all_read on public.integration_sync_logs
    for select to authenticated
    using (true);

create policy cert_select on public.issued_certificates
    for select to authenticated
    using (true);
create policy cert_write on public.issued_certificates
    for all to authenticated
    using ((is_platform_admin() OR ((competition_id IS NOT NULL) AND is_competition_judge(competition_id))))
    with check ((is_platform_admin() OR ((competition_id IS NOT NULL) AND is_competition_judge(competition_id))));

create policy marifat_activity_scores_w_delete on public.marifat_activity_scores
    for delete to authenticated
    using (is_staff());
create policy marifat_activity_scores_w_insert on public.marifat_activity_scores
    for insert to authenticated
    with check (is_staff());
create policy marifat_activity_scores_w_update on public.marifat_activity_scores
    for update to authenticated
    using (is_staff())
    with check (is_staff());
create policy mas_all_read on public.marifat_activity_scores
    for select to authenticated
    using (true);

create policy ma_all_read on public.marifat_attendance
    for select to authenticated
    using (true);
create policy marifat_attendance_w_delete on public.marifat_attendance
    for delete to authenticated
    using (is_staff());
create policy marifat_attendance_w_insert on public.marifat_attendance
    for insert to authenticated
    with check (is_staff());
create policy marifat_attendance_w_update on public.marifat_attendance
    for update to authenticated
    using (is_staff())
    with check (is_staff());

create policy marifat_lessons_w_delete on public.marifat_lessons
    for delete to authenticated
    using (is_staff());
create policy marifat_lessons_w_insert on public.marifat_lessons
    for insert to authenticated
    with check (is_staff());
create policy marifat_lessons_w_update on public.marifat_lessons
    for update to authenticated
    using (is_staff())
    with check (is_staff());
create policy ml_all_read on public.marifat_lessons
    for select to authenticated
    using (true);

-- ESKI QOIDA (Supabase panelida yaratilgan) - yangilari bilan birga turibdi.
create policy "admins manage memberships" on public.memberships
    for all to public
    using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'ADMINISTRATOR'::user_role)))));
create policy "memberships readable by everyone" on public.memberships
    for select to public
    using (true);
create policy memberships_delete on public.memberships
    for delete to authenticated
    using ((is_platform_admin() OR ((user_id)::text = (auth.uid())::text)));
create policy memberships_insert on public.memberships
    for insert to authenticated
    with check ((is_platform_admin() OR ((user_id)::text = (auth.uid())::text)));
create policy memberships_select on public.memberships
    for select to authenticated
    using (true);
create policy memberships_update on public.memberships
    for update to authenticated
    using ((is_platform_admin() OR ((user_id)::text = (auth.uid())::text)))
    with check ((is_platform_admin() OR ((user_id)::text = (auth.uid())::text)));
-- DIQQAT: rol qiymatini memberships_guard_role trigger qo'riqlaydi -
-- talaba o'ziga 'head_coordinator' yoza olmaydi.

create policy notification_prefs_own on public.notification_preferences
    for all to authenticated
    using ((username = current_username()))
    with check ((username = current_username()));

create policy notifications_append on public.notifications
    for insert to authenticated
    with check (true);
create policy notifications_delete_own on public.notifications
    for delete to authenticated
    using (((user_id = current_username()) OR (user_id = (auth.uid())::text) OR is_staff()));
create policy notifications_read on public.notifications
    for select to authenticated
    using (((user_id = current_username()) OR (user_id = (auth.uid())::text) OR is_staff()));
create policy notifications_update_own on public.notifications
    for update to authenticated
    using (((user_id = current_username()) OR (user_id = (auth.uid())::text) OR is_staff()))
    with check (((user_id = current_username()) OR (user_id = (auth.uid())::text) OR is_staff()));

create policy pal_insert on public.passport_access_logs
    for insert to authenticated
    with check (true);
create policy pal_select on public.passport_access_logs
    for select to authenticated
    using (((student_id = current_username()) OR is_platform_admin()));

-- profiles ga YOZISH qoidasi ATAYLAB yo'q: rol va login faqat
-- admin_* funksiyalari (security definer) orqali o'zgaradi;
-- profiles_guard_identity trigger ham shuni qo'riqlaydi.
create policy profiles_select_own_or_staff on public.profiles
    for select to authenticated
    using ((((id)::text = (auth.uid())::text) OR is_staff()));

create policy protocol_participants_rw_read on public.protocol_participants
    for select to authenticated
    using (true);
create policy protocol_participants_w_delete on public.protocol_participants
    for delete to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_participants.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy protocol_participants_w_insert on public.protocol_participants
    for insert to authenticated
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_participants.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy protocol_participants_w_update on public.protocol_participants
    for update to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_participants.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))))
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_participants.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));

create policy protocol_signers_rw_read on public.protocol_signers
    for select to authenticated
    using (true);
create policy protocol_signers_w_delete on public.protocol_signers
    for delete to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_signers.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy protocol_signers_w_insert on public.protocol_signers
    for insert to authenticated
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_signers.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id))))));
create policy protocol_signers_w_update on public.protocol_signers
    for update to authenticated
    using ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_signers.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id)))) OR (username = current_username())))
    with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM protocols p
  WHERE ((p.id = protocol_signers.protocol_id) AND can_manage_activity(p.activity_type, p.activity_id)))) OR (username = current_username())));

create policy protocols_rw_read on public.protocols
    for select to authenticated
    using (true);
create policy protocols_w_delete on public.protocols
    for delete to authenticated
    using (can_manage_activity(activity_type, activity_id));
create policy protocols_w_insert on public.protocols
    for insert to authenticated
    with check (can_manage_activity(activity_type, activity_id));
create policy protocols_w_update on public.protocols
    for update to authenticated
    using (can_manage_activity(activity_type, activity_id))
    with check (can_manage_activity(activity_type, activity_id));

create policy question_bases_all_read on public.question_bases
    for select to authenticated
    using (true);
create policy question_bases_w_delete on public.question_bases
    for delete to authenticated
    using (is_platform_admin());
create policy question_bases_w_insert on public.question_bases
    for insert to authenticated
    with check (is_platform_admin());
create policy question_bases_w_update on public.question_bases
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy reading_sessions_all_read on public.reading_sessions
    for select to authenticated
    using (true);
create policy reading_sessions_w_delete on public.reading_sessions
    for delete to authenticated
    using (is_staff());
create policy reading_sessions_w_insert on public.reading_sessions
    for insert to authenticated
    with check ((is_staff() OR (student_id = current_username())));
create policy reading_sessions_w_update on public.reading_sessions
    for update to authenticated
    using ((is_staff() OR (student_id = current_username())))
    with check ((is_staff() OR (student_id = current_username())));

create policy rc_all_read on public.recognition_cases
    for select to authenticated
    using (true);
create policy recognition_cases_w_delete on public.recognition_cases
    for delete to authenticated
    using (is_platform_admin());
create policy recognition_cases_w_insert on public.recognition_cases
    for insert to authenticated
    with check (is_platform_admin());
create policy recognition_cases_w_update on public.recognition_cases
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());

create policy recognition_records_w_delete on public.recognition_records
    for delete to authenticated
    using (is_platform_admin());
create policy recognition_records_w_insert on public.recognition_records
    for insert to authenticated
    with check (is_platform_admin());
create policy recognition_records_w_update on public.recognition_records
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy rr_all_read on public.recognition_records
    for select to authenticated
    using (true);

create policy recognition_rules_admin_delete on public.recognition_rules
    for delete to authenticated
    using (is_platform_admin());
create policy recognition_rules_admin_insert on public.recognition_rules
    for insert to authenticated
    with check (is_platform_admin());
create policy recognition_rules_admin_update on public.recognition_rules
    for update to authenticated
    using (is_platform_admin())
    with check (is_platform_admin());
create policy rrules_all_read on public.recognition_rules
    for select to authenticated
    using (true);

-- ESKI QOIDALAR (Supabase panelida yaratilgan): ro'yxatdan o'tish va
-- uning jurnali hali toraytirilmagan - keyingi ish.
create policy "authenticated read/write registration_audit_logs" on public.registration_audit_logs
    for all to public
    using ((auth.role() = 'authenticated'::text))
    with check ((auth.role() = 'authenticated'::text));
create policy "authenticated read/write registrations" on public.registrations
    for all to public
    using ((auth.role() = 'authenticated'::text))
    with check ((auth.role() = 'authenticated'::text));
