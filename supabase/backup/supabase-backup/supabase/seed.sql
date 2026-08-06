SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict SzKKe9oJ1a1qJaDSc0ST3NInEbDLC3v9OFfFPhNcrd66oDguWZruuNkzdrcUIOc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") VALUES
	('87749dbc-c430-42fa-b100-c47fd21c46d9', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-22 23:57:25.357269+00', '2026-07-22 23:57:25.357269+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('b372a64b-126e-47c0-8ed5-b8d07c939340', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 14:46:39.822353+00', '2026-07-23 14:46:39.822353+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('58d1877c-8d7d-4a2f-b3d8-2cbd003344ef', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 14:47:15.708258+00', '2026-07-23 14:47:15.708258+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('e8d88b19-2d16-4c74-a728-acd3c1f18a9f', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:08:33.974276+00', '2026-07-23 18:08:33.974276+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('65a7d6cb-de7d-466e-9ee4-480d7660898c', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:13:01.04674+00', '2026-07-23 18:13:01.04674+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('90405251-e6db-4eb1-aef5-c2faf43964d8', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:14:35.863552+00', '2026-07-23 18:14:35.863552+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('f4ecc67d-2266-4f53-bc0c-e741b338fd42', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:14:57.607148+00', '2026-07-23 18:14:57.607148+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('e842b47e-1953-4fc5-b0f6-c877734fb281', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:15:10.714163+00', '2026-07-23 18:15:10.714163+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('26344ea0-9493-4cc3-8a7f-6acff5a97b24', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:18:06.675396+00', '2026-07-23 18:18:06.675396+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('468186b9-d996-4e21-a707-43c4fae5f280', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-23 18:21:37.164022+00', '2026-07-23 18:21:37.164022+00', 'oauth', NULL, NULL, 'http://localhost:8080/dashboard', NULL, NULL, false),
	('705e563d-a806-4064-861a-10578e06c92c', NULL, NULL, NULL, NULL, 'google', '', '', '2026-07-25 22:54:49.793784+00', '2026-07-25 22:54:49.793784+00', 'oauth', NULL, NULL, 'http://localhost:3000', NULL, NULL, false);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', '4f38ef6f-043d-4de7-a94e-0f1389d6a871', 'authenticated', 'authenticated', 'carlos.jaques@polijunior.com.br', '$2a$10$Cjn735OzeGXFswfKyrEzD.kqTS69kebHKRaqWw9vPszVmiJskWjr.', '2026-07-18 14:31:58.398616+00', NULL, '', '2026-07-18 14:31:39.142+00', '', NULL, '', '', NULL, '2026-07-18 14:31:58.40418+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "4f38ef6f-043d-4de7-a94e-0f1389d6a871", "email": "carlos.jaques@polijunior.com.br", "status": "ativo", "org_name": "Jaques", "org_share_id": "POLI", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', NULL, '2026-07-17 19:40:36.117416+00', '2026-07-18 14:31:58.406196+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '1f71f6ea-8563-4e0a-8c49-4100e6926b5f', 'authenticated', 'authenticated', 'jpparaujo2007@gmail.com', '$2a$10$uITR5JUQ9hCmZH1xnk3yWeKQsQNuZ3nsfti2M110Gu3f2Tu/wQSaS', '2026-07-24 17:41:24.575184+00', NULL, '', '2026-07-24 17:39:45.526561+00', '', NULL, '', '', NULL, '2026-07-24 17:41:24.587254+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "1f71f6ea-8563-4e0a-8c49-4100e6926b5f", "email": "jpparaujo2007@gmail.com", "email_verified": true, "phone_verified": false}', NULL, '2026-07-24 17:39:45.368043+00', '2026-07-24 17:41:24.62842+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '5ce07b07-f2b0-4688-861f-612bd13a61ca', 'authenticated', 'authenticated', 'alexandre@babygoat.com', '$2a$10$ZwVpxZ2ILdWlxP5MWszJgOGaJygJSxi7GIQsDErZKNisyKRk06mhW', NULL, NULL, '1abe37415dc8839eaeea49d6c86f14824523a5de8d2546f079c20ff7', '2026-07-23 14:19:10.478029+00', '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"sub": "5ce07b07-f2b0-4688-861f-612bd13a61ca", "email": "alexandre@babygoat.com", "email_verified": false, "phone_verified": false}', NULL, '2026-07-23 14:19:10.421056+00', '2026-07-23 14:19:11.101072+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '702fb64c-e4fe-4481-a409-2a943be31a99', 'authenticated', 'authenticated', 'kakamoussalli@gmail.com', '$2a$10$0NHn8JxTdSiEKhwvA/qkQe.g7kSTL9iLF/qwUuOfK9a8Astf2iab2', '2026-07-17 00:39:01.607726+00', NULL, '', '2026-07-17 00:36:39.736815+00', '', NULL, '', '', NULL, '2026-07-25 22:55:25.013822+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "702fb64c-e4fe-4481-a409-2a943be31a99", "email": "kakamoussalli@gmail.com", "status": "ativo", "org_name": "Caqui", "org_share_id": "KQUI", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', NULL, '2026-07-17 00:36:39.616908+00', '2026-07-25 22:55:25.086675+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', 'authenticated', 'authenticated', 'jose.quental@polijunior.com.br', '$2a$10$SIQFK7YV4XX3utOldYAxP.Y9Db0FtS7c4JnO.tBJrXyq.SVxLb9gi', '2026-07-16 03:25:33.027869+00', NULL, '', '2026-07-16 03:25:03.576694+00', '', NULL, '', '', NULL, '2026-07-23 14:06:32.640991+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "c045f9db-d1e5-48be-9acc-ae51b60a2bbf", "email": "jose.quental@polijunior.com.br", "status": "ativo", "org_name": "Los Inovadores", "org_share_id": "INOV", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', NULL, '2026-07-16 03:22:19.545385+00', '2026-07-29 16:46:50.799614+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'authenticated', 'authenticated', 'alexandredelbim@gmail.com', '$2a$10$5Fu/QDxPtg9WnUkCbXmE1.BiVB8FPQmBDSZLmjVbCTqF5XMJYsmrm', '2026-07-18 04:30:17.507045+00', NULL, '', '2026-07-18 04:29:20.485635+00', '', NULL, '', '', NULL, '2026-08-03 22:04:50.375275+00', '{"provider": "email", "providers": ["email", "google"]}', '{"iss": "https://accounts.google.com", "sub": "100974444429674027765", "name": "Alexandre Delbim", "email": "alexandredelbim@gmail.com", "status": "ativo", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIyqIKckkobiJ4BmCl0NnB7VU-u1L5MYd5UwxXXvHCL8o3C9DSv=s96-c", "org_name": "Babygoat", "full_name": "Alexandre Delbim", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIyqIKckkobiJ4BmCl0NnB7VU-u1L5MYd5UwxXXvHCL8o3C9DSv=s96-c", "provider_id": "100974444429674027765", "org_share_id": "BGBG", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', NULL, '2026-07-18 04:29:20.379415+00', '2026-08-04 20:11:01.03918+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc', 'authenticated', 'authenticated', 'ricardo.moussalli@polijunior.com.br', '$2a$10$it0qwiXZESSU3panXb8Tiu/Ey4575iIjx5z0MIIASbEPFrYLDELd2', '2026-07-17 01:04:09.631767+00', NULL, '', '2026-07-17 01:02:24.697828+00', '', NULL, '', '', NULL, '2026-07-17 02:02:12.751786+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc", "email": "ricardo.moussalli@polijunior.com.br", "status": "pendente", "email_verified": true, "phone_verified": false, "organization_id": "c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5"}', NULL, '2026-07-17 01:02:24.673988+00', '2026-07-17 02:02:12.760136+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'c24fbc65-ca45-4f90-8763-76597c744b33', 'authenticated', 'authenticated', 'carlosrichelieu1@gmail.com', '$2a$10$qudB1m93WjOwixEKj9DzYuWd7hdDfatu7MdFBb2TUpuUifXU5zrAe', '2026-07-17 19:41:33.925311+00', NULL, '', '2026-07-17 19:41:18.758062+00', '', NULL, '', '', NULL, '2026-07-17 19:41:33.931455+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "c24fbc65-ca45-4f90-8763-76597c744b33", "email": "carlosrichelieu1@gmail.com", "status": "pendente", "email_verified": true, "phone_verified": false, "organization_id": "e45cf6fd-434e-49d6-944c-90f8750ba74f"}', NULL, '2026-07-17 19:41:18.736433+00', '2026-07-17 19:41:33.979994+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '5122391a-9041-421c-9397-401360277674', 'authenticated', 'authenticated', 'allekka5454@gmail.com', NULL, '2026-07-23 04:20:20.318607+00', NULL, '', '2026-07-22 23:46:07.593986+00', '', NULL, '', '', NULL, '2026-07-23 04:20:20.326982+00', '{"provider": "google", "providers": ["google"]}', '{"iss": "https://accounts.google.com", "sub": "112390467469785376078", "name": "Allekka 54", "email": "allekka5454@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJBaaIfMrHaTWkEAGpAe_gPzy8pi66BGt4DizTViBGnnqs0VEQ=s96-c", "full_name": "Allekka 54", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJBaaIfMrHaTWkEAGpAe_gPzy8pi66BGt4DizTViBGnnqs0VEQ=s96-c", "provider_id": "112390467469785376078", "email_verified": true, "phone_verified": false}', NULL, '2026-07-22 23:46:07.536298+00', '2026-07-23 04:20:20.348691+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '106ed8fc-e240-4595-914d-37891cab5d43', 'authenticated', 'authenticated', 'bernardomachado@usp.br', NULL, '2026-07-23 18:28:05.481787+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-07-23 18:28:05.486006+00', '{"provider": "google", "providers": ["google"]}', '{"iss": "https://accounts.google.com", "sub": "113936816812379686888", "name": "Bernardo Henriques Guimaraes Machado Assis", "email": "bernardomachado@usp.br", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJyO_jQNpZT78XhDny6c2pq8M7ew9Yy8gTawIvt8ZVTphLWjA=s96-c", "full_name": "Bernardo Henriques Guimaraes Machado Assis", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJyO_jQNpZT78XhDny6c2pq8M7ew9Yy8gTawIvt8ZVTphLWjA=s96-c", "provider_id": "113936816812379686888", "custom_claims": {"hd": "usp.br"}, "email_verified": true, "phone_verified": false}', NULL, '2026-07-23 18:28:05.452788+00', '2026-07-23 18:28:30.701331+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'authenticated', 'authenticated', 'bernardo.machado@polijunior.com.br', NULL, '2026-07-23 16:46:40.989115+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-08-04 18:14:58.938866+00', '{"provider": "google", "providers": ["google"]}', '{"iss": "https://accounts.google.com", "sub": "112453232640802641300", "name": "Bernardo Machado", "email": "bernardo.machado@polijunior.com.br", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIJLF-ZOTvko73lokXFZ8GCHJxyE7UjHDGwXx7CfQsLsnU2AY0=s96-c", "full_name": "Bernardo Machado", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIJLF-ZOTvko73lokXFZ8GCHJxyE7UjHDGwXx7CfQsLsnU2AY0=s96-c", "provider_id": "112453232640802641300", "custom_claims": {"hd": "polijunior.com.br"}, "email_verified": true, "phone_verified": false}', NULL, '2026-07-23 16:46:40.96256+00', '2026-08-04 21:09:11.62304+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc', '2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc', '{"sub": "2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc", "email": "ricardo.moussalli@polijunior.com.br", "status": "pendente", "email_verified": true, "phone_verified": false, "organization_id": "c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5"}', 'email', '2026-07-17 01:02:24.694378+00', '2026-07-17 01:02:24.694421+00', '2026-07-17 01:02:24.694421+00', '34bea508-2346-4a94-b464-ee360cc06ffb'),
	('c045f9db-d1e5-48be-9acc-ae51b60a2bbf', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', '{"sub": "c045f9db-d1e5-48be-9acc-ae51b60a2bbf", "email": "jose.quental@polijunior.com.br", "status": "ativo", "org_name": "Los Inovadores", "org_share_id": "INOV", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', 'email', '2026-07-16 03:22:19.632258+00', '2026-07-16 03:22:19.632317+00', '2026-07-16 03:22:19.632317+00', '249647c8-e97b-4ca4-a08e-58ef8d7dcae8'),
	('702fb64c-e4fe-4481-a409-2a943be31a99', '702fb64c-e4fe-4481-a409-2a943be31a99', '{"sub": "702fb64c-e4fe-4481-a409-2a943be31a99", "email": "kakamoussalli@gmail.com", "status": "ativo", "org_name": "Caqui", "org_share_id": "KQUI", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', 'email', '2026-07-17 00:36:39.720597+00', '2026-07-17 00:36:39.720704+00', '2026-07-17 00:36:39.720704+00', '22b26d40-4658-4983-84b4-5a7859c08e37'),
	('c24fbc65-ca45-4f90-8763-76597c744b33', 'c24fbc65-ca45-4f90-8763-76597c744b33', '{"sub": "c24fbc65-ca45-4f90-8763-76597c744b33", "email": "carlosrichelieu1@gmail.com", "status": "pendente", "email_verified": true, "phone_verified": false, "organization_id": "e45cf6fd-434e-49d6-944c-90f8750ba74f"}', 'email', '2026-07-17 19:41:18.752094+00', '2026-07-17 19:41:18.752143+00', '2026-07-17 19:41:18.752143+00', 'b618bf4d-4940-48b1-a07d-5cd98d6dce97'),
	('1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', '{"sub": "1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5", "email": "alexandredelbim@gmail.com", "status": "ativo", "org_name": "Babygoat", "org_share_id": "BGBG", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', 'email', '2026-07-18 04:29:20.473645+00', '2026-07-18 04:29:20.473824+00', '2026-07-18 04:29:20.473824+00', 'feae87fc-7130-46d8-b209-52e5b26662a5'),
	('100974444429674027765', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', '{"iss": "https://accounts.google.com", "sub": "100974444429674027765", "name": "Alexandre Delbim", "email": "alexandredelbim@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIyqIKckkobiJ4BmCl0NnB7VU-u1L5MYd5UwxXXvHCL8o3C9DSv=s96-c", "full_name": "Alexandre Delbim", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIyqIKckkobiJ4BmCl0NnB7VU-u1L5MYd5UwxXXvHCL8o3C9DSv=s96-c", "provider_id": "100974444429674027765", "email_verified": true, "phone_verified": false}', 'google', '2026-07-22 23:57:53.432898+00', '2026-07-22 23:57:53.432956+00', '2026-08-03 22:04:50.360244+00', '4d23dab4-e1e7-461c-981e-c33513c6804b'),
	('4f38ef6f-043d-4de7-a94e-0f1389d6a871', '4f38ef6f-043d-4de7-a94e-0f1389d6a871', '{"sub": "4f38ef6f-043d-4de7-a94e-0f1389d6a871", "email": "carlos.jaques@polijunior.com.br", "status": "ativo", "org_name": "Jaques", "org_share_id": "POLI", "email_verified": true, "is_admin_setup": "true", "phone_verified": false}', 'email', '2026-07-17 19:40:36.234791+00', '2026-07-17 19:40:36.234838+00', '2026-07-17 19:40:36.234838+00', '3e822399-b8f9-4a92-b8f9-d68c3404ac90'),
	('112390467469785376078', '5122391a-9041-421c-9397-401360277674', '{"iss": "https://accounts.google.com", "sub": "112390467469785376078", "name": "Allekka 54", "email": "allekka5454@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJBaaIfMrHaTWkEAGpAe_gPzy8pi66BGt4DizTViBGnnqs0VEQ=s96-c", "full_name": "Allekka 54", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJBaaIfMrHaTWkEAGpAe_gPzy8pi66BGt4DizTViBGnnqs0VEQ=s96-c", "provider_id": "112390467469785376078", "email_verified": true, "phone_verified": false}', 'google', '2026-07-23 04:20:20.295579+00', '2026-07-23 04:20:20.29563+00', '2026-07-23 04:20:20.29563+00', '7d195618-b65b-4355-a829-e97fa8332128'),
	('5ce07b07-f2b0-4688-861f-612bd13a61ca', '5ce07b07-f2b0-4688-861f-612bd13a61ca', '{"sub": "5ce07b07-f2b0-4688-861f-612bd13a61ca", "email": "alexandre@babygoat.com", "email_verified": false, "phone_verified": false}', 'email', '2026-07-23 14:19:10.470495+00', '2026-07-23 14:19:10.470556+00', '2026-07-23 14:19:10.470556+00', 'bf11321b-a3f4-4e3e-a07c-c7b684fc6974'),
	('113936816812379686888', '106ed8fc-e240-4595-914d-37891cab5d43', '{"iss": "https://accounts.google.com", "sub": "113936816812379686888", "name": "Bernardo Henriques Guimaraes Machado Assis", "email": "bernardomachado@usp.br", "picture": "https://lh3.googleusercontent.com/a/ACg8ocJyO_jQNpZT78XhDny6c2pq8M7ew9Yy8gTawIvt8ZVTphLWjA=s96-c", "full_name": "Bernardo Henriques Guimaraes Machado Assis", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocJyO_jQNpZT78XhDny6c2pq8M7ew9Yy8gTawIvt8ZVTphLWjA=s96-c", "provider_id": "113936816812379686888", "custom_claims": {"hd": "usp.br"}, "email_verified": true, "phone_verified": false}', 'google', '2026-07-23 18:28:05.476183+00', '2026-07-23 18:28:05.476366+00', '2026-07-23 18:28:05.476366+00', '60c297ab-b050-40e8-ad44-4f8663516242'),
	('1f71f6ea-8563-4e0a-8c49-4100e6926b5f', '1f71f6ea-8563-4e0a-8c49-4100e6926b5f', '{"sub": "1f71f6ea-8563-4e0a-8c49-4100e6926b5f", "email": "jpparaujo2007@gmail.com", "email_verified": true, "phone_verified": false}', 'email', '2026-07-24 17:39:45.510364+00', '2026-07-24 17:39:45.510416+00', '2026-07-24 17:39:45.510416+00', 'd7994cf1-32c0-44bd-aa82-2e80d0cd3d02'),
	('112453232640802641300', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '{"iss": "https://accounts.google.com", "sub": "112453232640802641300", "name": "Bernardo Machado", "email": "bernardo.machado@polijunior.com.br", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIJLF-ZOTvko73lokXFZ8GCHJxyE7UjHDGwXx7CfQsLsnU2AY0=s96-c", "full_name": "Bernardo Machado", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIJLF-ZOTvko73lokXFZ8GCHJxyE7UjHDGwXx7CfQsLsnU2AY0=s96-c", "provider_id": "112453232640802641300", "custom_claims": {"hd": "polijunior.com.br"}, "email_verified": true, "phone_verified": false}', 'google', '2026-07-23 16:46:40.983696+00', '2026-07-23 16:46:40.983757+00', '2026-08-04 18:14:58.930664+00', 'e90438bd-2448-48ef-bfc1-6dd9b7cc600b');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('99c05a70-c362-4e62-9517-50f78556dde6', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '2026-07-23 18:35:05.160521+00', '2026-08-04 18:10:32.509943+00', NULL, 'aal1', NULL, '2026-08-04 18:10:32.509851', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', '187.15.85.56', NULL, NULL, NULL, NULL, NULL),
	('e9338d75-a00b-427b-bc65-512a06079d3e', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', '2026-08-03 22:04:50.376496+00', '2026-08-04 20:11:01.076061+00', NULL, 'aal1', NULL, '2026-08-04 20:11:01.07597', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 OPR/133.0.0.0', '177.45.6.16', NULL, NULL, NULL, NULL, NULL),
	('0bfd3a30-7ebb-49b1-ac07-ca52614f930c', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '2026-08-04 18:14:58.940242+00', '2026-08-04 21:09:11.66026+00', NULL, 'aal1', NULL, '2026-08-04 21:09:11.660178', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', '187.15.86.116', NULL, NULL, NULL, NULL, NULL),
	('c29787ec-7023-4978-926b-39705d5c14ba', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', '2026-07-16 03:25:33.041054+00', '2026-07-16 03:25:33.041054+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '191.5.210.98', NULL, NULL, NULL, NULL, NULL),
	('bef4f437-0f06-482d-8ed2-1595210a8b9f', 'c24fbc65-ca45-4f90-8763-76597c744b33', '2026-07-17 19:41:33.933513+00', '2026-07-17 19:41:33.933513+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '187.19.184.235', NULL, NULL, NULL, NULL, NULL),
	('da7c7f94-63a7-44d1-afe0-da5a0de8023e', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', '2026-07-16 03:26:45.161324+00', '2026-07-18 14:26:43.212221+00', NULL, 'aal1', NULL, '2026-07-18 14:26:43.212135', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '191.5.210.98', NULL, NULL, NULL, NULL, NULL),
	('bb22f21c-afc6-4be5-a1cf-6e638065337a', '4f38ef6f-043d-4de7-a94e-0f1389d6a871', '2026-07-18 14:31:58.40427+00', '2026-07-18 14:31:58.40427+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '187.19.184.235', NULL, NULL, NULL, NULL, NULL),
	('ecdb4329-8444-4e5c-aec3-1951cd8c45e3', '5122391a-9041-421c-9397-401360277674', '2026-07-23 04:20:20.32808+00', '2026-07-23 04:20:20.32808+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.24012.1 Chrome/148.0.7778.280 Electron/42.7.0 Safari/537.36 MSIX', '201.68.209.139', NULL, NULL, NULL, NULL, NULL),
	('3a958f47-0854-4bde-86c9-72a74b535c09', '1f71f6ea-8563-4e0a-8c49-4100e6926b5f', '2026-07-24 17:41:24.587421+00', '2026-07-24 17:41:24.587421+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '189.62.148.57', NULL, NULL, NULL, NULL, NULL),
	('77f4c897-4871-467b-890f-06234eca7886', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', '2026-07-18 14:27:07.524239+00', '2026-07-23 14:05:43.166748+00', NULL, 'aal1', NULL, '2026-07-23 14:05:43.166637', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '191.5.210.98', NULL, NULL, NULL, NULL, NULL),
	('d2ee5d88-3d06-4bd5-9578-4b44c803f27f', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', '2026-07-23 14:06:32.641083+00', '2026-07-29 16:46:50.897411+00', NULL, 'aal1', NULL, '2026-07-29 16:46:50.897278', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', '191.5.210.98', NULL, NULL, NULL, NULL, NULL),
	('d1345aca-9c39-48a7-981e-87f76d1d357a', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', '2026-08-03 21:21:05.140034+00', '2026-08-03 21:21:05.140034+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 OPR/133.0.0.0', '177.45.6.16', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('c29787ec-7023-4978-926b-39705d5c14ba', '2026-07-16 03:25:33.077878+00', '2026-07-16 03:25:33.077878+00', 'otp', '0b9b1cf1-ddb8-48f6-8687-cbc4a31d04d5'),
	('da7c7f94-63a7-44d1-afe0-da5a0de8023e', '2026-07-16 03:26:45.164361+00', '2026-07-16 03:26:45.164361+00', 'password', '812b7bd5-9836-4ee8-b1dc-ee7f19be76fb'),
	('bef4f437-0f06-482d-8ed2-1595210a8b9f', '2026-07-17 19:41:33.981473+00', '2026-07-17 19:41:33.981473+00', 'otp', '661a1c76-4ca3-40e6-a087-9515fedc72cb'),
	('77f4c897-4871-467b-890f-06234eca7886', '2026-07-18 14:27:07.528958+00', '2026-07-18 14:27:07.528958+00', 'password', '4f207723-538a-4374-9ed0-aa81d0bd1382'),
	('bb22f21c-afc6-4be5-a1cf-6e638065337a', '2026-07-18 14:31:58.406591+00', '2026-07-18 14:31:58.406591+00', 'otp', 'f8c0a7b2-e0c4-44f6-94fa-c0c67964c572'),
	('ecdb4329-8444-4e5c-aec3-1951cd8c45e3', '2026-07-23 04:20:20.350158+00', '2026-07-23 04:20:20.350158+00', 'oauth', 'ce85a2e3-94f4-432f-8b1e-9db1e534f8a2'),
	('d2ee5d88-3d06-4bd5-9578-4b44c803f27f', '2026-07-23 14:06:32.646376+00', '2026-07-23 14:06:32.646376+00', 'password', 'd06a80aa-98fb-4e2d-93d3-eeaaad7f2031'),
	('99c05a70-c362-4e62-9517-50f78556dde6', '2026-07-23 18:35:05.165281+00', '2026-07-23 18:35:05.165281+00', 'oauth', 'd56c8f90-ea38-445b-9d49-f0dd47aba856'),
	('3a958f47-0854-4bde-86c9-72a74b535c09', '2026-07-24 17:41:24.629803+00', '2026-07-24 17:41:24.629803+00', 'otp', 'd93ad685-4479-4828-8d3f-6440416cc67f'),
	('d1345aca-9c39-48a7-981e-87f76d1d357a', '2026-08-03 21:21:05.177745+00', '2026-08-03 21:21:05.177745+00', 'oauth', 'c149d321-690e-4b6e-9fa4-d3f2f8dc1b6c'),
	('e9338d75-a00b-427b-bc65-512a06079d3e', '2026-08-03 22:04:50.413841+00', '2026-08-03 22:04:50.413841+00', 'oauth', 'df6df645-4857-455c-82c3-2f77da1e0802'),
	('0bfd3a30-7ebb-49b1-ac07-ca52614f930c', '2026-08-04 18:14:58.959093+00', '2026-08-04 18:14:58.959093+00', 'oauth', '898f05a3-5f0e-442d-9565-258dce9c4214');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at") VALUES
	('7ff9f98d-0097-4bb8-b4aa-2ef8af116144', '5ce07b07-f2b0-4688-861f-612bd13a61ca', 'confirmation_token', '1abe37415dc8839eaeea49d6c86f14824523a5de8d2546f079c20ff7', 'alexandre@babygoat.com', '2026-07-23 14:19:11.104308', '2026-07-23 14:19:11.104308');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 14, 'plruub7widf3', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', false, '2026-07-16 03:25:33.058084+00', '2026-07-16 03:25:33.058084+00', NULL, 'c29787ec-7023-4978-926b-39705d5c14ba'),
	('00000000-0000-0000-0000-000000000000', 79, '5yb37adf37zq', '1f71f6ea-8563-4e0a-8c49-4100e6926b5f', false, '2026-07-24 17:41:24.604688+00', '2026-07-24 17:41:24.604688+00', NULL, '3a958f47-0854-4bde-86c9-72a74b535c09'),
	('00000000-0000-0000-0000-000000000000', 65, 'qgr3phmugo63', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', true, '2026-07-23 14:06:32.644498+00', '2026-07-29 16:46:50.758828+00', NULL, 'd2ee5d88-3d06-4bd5-9578-4b44c803f27f'),
	('00000000-0000-0000-0000-000000000000', 81, '6lsc463nby2n', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', false, '2026-07-29 16:46:50.784911+00', '2026-07-29 16:46:50.784911+00', 'qgr3phmugo63', 'd2ee5d88-3d06-4bd5-9578-4b44c803f27f'),
	('00000000-0000-0000-0000-000000000000', 82, 'ccriqnaevmvn', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', false, '2026-08-03 21:21:05.153829+00', '2026-08-03 21:21:05.153829+00', NULL, 'd1345aca-9c39-48a7-981e-87f76d1d357a'),
	('00000000-0000-0000-0000-000000000000', 83, 'qpmkkcu3lg4x', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', true, '2026-08-03 22:04:50.391026+00', '2026-08-04 01:04:52.32141+00', NULL, 'e9338d75-a00b-427b-bc65-512a06079d3e'),
	('00000000-0000-0000-0000-000000000000', 78, 'h6imbpk7iw5p', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', true, '2026-07-23 18:35:05.161917+00', '2026-08-04 18:10:32.440381+00', NULL, '99c05a70-c362-4e62-9517-50f78556dde6'),
	('00000000-0000-0000-0000-000000000000', 85, '7currxelydev', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', false, '2026-08-04 18:10:32.456845+00', '2026-08-04 18:10:32.456845+00', 'h6imbpk7iw5p', '99c05a70-c362-4e62-9517-50f78556dde6'),
	('00000000-0000-0000-0000-000000000000', 86, 'vvrp2iy5lh2q', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', true, '2026-08-04 18:14:58.951218+00', '2026-08-04 19:13:32.298756+00', NULL, '0bfd3a30-7ebb-49b1-ac07-ca52614f930c'),
	('00000000-0000-0000-0000-000000000000', 84, 'vexkaz66mc2f', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', true, '2026-08-04 01:04:52.339101+00', '2026-08-04 20:11:01.017285+00', 'qpmkkcu3lg4x', 'e9338d75-a00b-427b-bc65-512a06079d3e'),
	('00000000-0000-0000-0000-000000000000', 88, 'glx5qofxagig', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', false, '2026-08-04 20:11:01.035559+00', '2026-08-04 20:11:01.035559+00', 'vexkaz66mc2f', 'e9338d75-a00b-427b-bc65-512a06079d3e'),
	('00000000-0000-0000-0000-000000000000', 87, 'hofwomd4h7sk', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', true, '2026-08-04 19:13:32.303743+00', '2026-08-04 21:09:11.596792+00', 'vvrp2iy5lh2q', '0bfd3a30-7ebb-49b1-ac07-ca52614f930c'),
	('00000000-0000-0000-0000-000000000000', 89, 'keasnfzrkcne', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', false, '2026-08-04 21:09:11.615693+00', '2026-08-04 21:09:11.615693+00', 'hofwomd4h7sk', '0bfd3a30-7ebb-49b1-ac07-ca52614f930c'),
	('00000000-0000-0000-0000-000000000000', 33, 'jumi2cdgkjyi', 'c24fbc65-ca45-4f90-8763-76597c744b33', false, '2026-07-17 19:41:33.955779+00', '2026-07-17 19:41:33.955779+00', NULL, 'bef4f437-0f06-482d-8ed2-1595210a8b9f'),
	('00000000-0000-0000-0000-000000000000', 15, 'jnl4wtwippvc', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', true, '2026-07-16 03:26:45.162874+00', '2026-07-18 14:26:43.177101+00', NULL, 'da7c7f94-63a7-44d1-afe0-da5a0de8023e'),
	('00000000-0000-0000-0000-000000000000', 39, 'gql7xwhbkq27', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', false, '2026-07-18 14:26:43.184928+00', '2026-07-18 14:26:43.184928+00', 'jnl4wtwippvc', 'da7c7f94-63a7-44d1-afe0-da5a0de8023e'),
	('00000000-0000-0000-0000-000000000000', 44, 'xtomx4srfuj7', '4f38ef6f-043d-4de7-a94e-0f1389d6a871', false, '2026-07-18 14:31:58.405196+00', '2026-07-18 14:31:58.405196+00', NULL, 'bb22f21c-afc6-4be5-a1cf-6e638065337a'),
	('00000000-0000-0000-0000-000000000000', 60, 'gbemvgo733gq', '5122391a-9041-421c-9397-401360277674', false, '2026-07-23 04:20:20.340138+00', '2026-07-23 04:20:20.340138+00', NULL, 'ecdb4329-8444-4e5c-aec3-1951cd8c45e3'),
	('00000000-0000-0000-0000-000000000000', 40, 'ejshdtkpg5dw', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', true, '2026-07-18 14:27:07.527088+00', '2026-07-23 14:05:43.123654+00', NULL, '77f4c897-4871-467b-890f-06234eca7886'),
	('00000000-0000-0000-0000-000000000000', 64, 'imnr4f6tgvlc', 'c045f9db-d1e5-48be-9acc-ae51b60a2bbf', false, '2026-07-23 14:05:43.12983+00', '2026-07-23 14:05:43.12983+00', 'ejshdtkpg5dw', '77f4c897-4871-467b-890f-06234eca7886');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: Leads; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."Leads" ("id", "created_at", "Nome", "Telefone", "Email") VALUES
	(14, '2026-07-15 20:34:19.461821+00', 'bernardo teste', '85748698656', 'bernardo.machado@polijunior.com.br'),
	(15, '2026-07-15 20:41:47.68517+00', 'bernardo teste 2', '85948560498', 'bernardo.machado@polijunior.com.br'),
	(16, '2026-07-15 20:48:28.226458+00', 'bernardo teste3', '85023942394', 'bernardo.machado@polijunior.com.br'),
	(17, '2026-07-15 20:53:18.708534+00', 'bernardo teste5', '85345930458', 'bernardo.machado@polijunior.com.br'),
	(18, '2026-07-20 17:30:06.227865+00', 'João Pedro', '47999030812', 'jpparaujo2007@gmail.com');


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organizations" ("id", "name", "created_at", "join_mode", "join_code") VALUES
	('8f92b292-0447-45e8-8f5f-d90ede37f993', 'Los Inovadores', '2026-07-16 03:22:19.542671+00', 'codigo', 'J6BQHAQAVMSF'),
	('c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Caqui', '2026-07-17 00:36:39.614836+00', 'codigo', 'YTDXHXFGWHFL'),
	('e45cf6fd-434e-49d6-944c-90f8750ba74f', 'Jaques', '2026-07-17 19:40:36.114636+00', 'codigo', 'DWE5ATKAQQW9'),
	('f2f52856-7315-4913-8b19-d5e1b7e248c6', 'Babygoat', '2026-07-18 04:29:20.377303+00', 'codigo', '3ZJSWMB4FLN3'),
	('f6bb2278-c010-4938-94eb-15079c6399f8', 'Babygoat2', '2026-07-22 23:46:07.534429+00', 'codigo', 'ANGPY8ATKLMW'),
	('645dddd1-e27f-40e0-9eff-def8bbe9755c', 'Teste1', '2026-07-23 18:28:06.878825+00', 'codigo', 'CONSEGUI'),
	('3bf8596f-7a4d-4b91-8fd5-bdb78a512251', 'Machado Lmtd', '2026-07-23 17:02:27.417766+00', 'codigo', 'MACHADO');


--
-- Data for Name: assistants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."roles" ("id", "organization_id", "name", "created_at") VALUES
	('59d394f1-c954-4c2f-9e5a-69e83f334e13', '8f92b292-0447-45e8-8f5f-d90ede37f993', 'Admin', '2026-07-16 03:22:19.542671+00'),
	('f4fa82f9-dcc4-4c16-be3f-7acd6ddb12ff', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Admin', '2026-07-17 00:36:39.614836+00'),
	('628bb2d3-3de8-411f-9fa3-c4c0a573270f', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Analista', '2026-07-17 00:40:06.373462+00'),
	('5a8f08fa-8ded-4e1f-b1d8-3aa1236f1964', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Gestor', '2026-07-17 01:19:00.112062+00'),
	('64f9d6f1-3c8d-4eed-9935-78b26bdeeb56', 'e45cf6fd-434e-49d6-944c-90f8750ba74f', 'Admin', '2026-07-17 19:40:36.114636+00'),
	('78136087-8665-4ab3-8422-a32fcd678464', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', 'Admin', '2026-07-18 04:29:20.377303+00'),
	('7eead5b3-e681-40dd-83e5-4139a2228b0b', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', 'babybabygoat', '2026-07-18 04:30:48.891267+00'),
	('a00f2bd6-6068-4287-b01a-534e4c49be7a', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Carlao', '2026-07-18 14:50:57.46616+00'),
	('8d511879-4621-47db-8de6-927bd5f55423', 'f6bb2278-c010-4938-94eb-15079c6399f8', 'Admin', '2026-07-22 23:46:07.534429+00'),
	('3f88690e-4ecd-4fc0-a5ea-f85a4182f1be', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', 'Admin', '2026-07-23 17:02:27.417766+00'),
	('720226db-a448-4a97-b430-35adbf40aae7', '645dddd1-e27f-40e0-9eff-def8bbe9755c', 'Admin', '2026-07-23 18:28:06.878825+00');


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "email", "organization_id", "role_id", "status", "created_at", "updated_at") VALUES
	('44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'bernardo.machado@polijunior.com.br', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', '3f88690e-4ecd-4fc0-a5ea-f85a4182f1be', 'ativo', '2026-07-23 16:46:40.956351+00', '2026-07-23 17:02:27.417766+00'),
	('106ed8fc-e240-4595-914d-37891cab5d43', 'bernardomachado@usp.br', '645dddd1-e27f-40e0-9eff-def8bbe9755c', '720226db-a448-4a97-b430-35adbf40aae7', 'ativo', '2026-07-23 18:28:05.443546+00', '2026-07-23 18:28:06.878825+00'),
	('1f71f6ea-8563-4e0a-8c49-4100e6926b5f', 'jpparaujo2007@gmail.com', NULL, NULL, 'pendente', '2026-07-24 17:39:45.366072+00', '2026-07-24 17:39:45.366072+00'),
	('c045f9db-d1e5-48be-9acc-ae51b60a2bbf', 'jose.quental@polijunior.com.br', '8f92b292-0447-45e8-8f5f-d90ede37f993', '59d394f1-c954-4c2f-9e5a-69e83f334e13', 'ativo', '2026-07-16 03:22:19.542671+00', '2026-07-23 16:51:39.409844+00'),
	('702fb64c-e4fe-4481-a409-2a943be31a99', 'kakamoussalli@gmail.com', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'f4fa82f9-dcc4-4c16-be3f-7acd6ddb12ff', 'ativo', '2026-07-17 00:36:39.614836+00', '2026-07-23 16:51:39.409844+00'),
	('2b7625b2-b3cb-4c5f-bc4d-402bdb5a7bdc', 'ricardo.moussalli@polijunior.com.br', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', '628bb2d3-3de8-411f-9fa3-c4c0a573270f', 'ativo', '2026-07-17 01:02:24.672885+00', '2026-07-23 16:51:39.409844+00'),
	('4f38ef6f-043d-4de7-a94e-0f1389d6a871', 'carlos.jaques@polijunior.com.br', 'e45cf6fd-434e-49d6-944c-90f8750ba74f', '64f9d6f1-3c8d-4eed-9935-78b26bdeeb56', 'ativo', '2026-07-17 19:40:36.114636+00', '2026-07-23 16:51:39.409844+00'),
	('c24fbc65-ca45-4f90-8763-76597c744b33', 'carlosrichelieu1@gmail.com', 'e45cf6fd-434e-49d6-944c-90f8750ba74f', NULL, 'pendente', '2026-07-17 19:41:18.736086+00', '2026-07-23 16:51:39.409844+00'),
	('1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'alexandredelbim@gmail.com', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '78136087-8665-4ab3-8422-a32fcd678464', 'ativo', '2026-07-18 04:29:20.377303+00', '2026-07-23 16:51:39.409844+00'),
	('5122391a-9041-421c-9397-401360277674', 'allekka5454@gmail.com', 'f6bb2278-c010-4938-94eb-15079c6399f8', '8d511879-4621-47db-8de6-927bd5f55423', 'ativo', '2026-07-22 23:46:07.534429+00', '2026-07-23 16:51:39.409844+00'),
	('5ce07b07-f2b0-4688-861f-612bd13a61ca', 'alexandre@babygoat.com', NULL, NULL, 'pendente', '2026-07-23 14:19:10.419116+00', '2026-07-23 16:51:39.409844+00');


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."conversations" ("id", "organization_id", "profile_id", "assistant_id", "title", "created_at", "updated_at") VALUES
	('88f23dc9-df8f-4c1f-8ad1-bd5e02902087', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto eu vendi', '2026-08-03 22:06:58.771071+00', '2026-08-03 22:06:58.771071+00'),
	('2259225c-9021-4543-ade4-763d405389d7', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:21:20.865537+00', '2026-08-03 22:21:20.865537+00'),
	('d0a9f1a7-bee0-4361-a2ff-39815e53bc57', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:36:40.234471+00', '2026-08-03 22:36:40.234471+00'),
	('3b599eae-bf60-4c0f-b909-9f5e620a70a8', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:40:38.866676+00', '2026-08-03 22:40:38.866676+00'),
	('2a2ff22d-ac4a-4df6-a842-b5fdc391954b', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:41:05.472784+00', '2026-08-03 22:41:05.472784+00'),
	('d7b9a015-bfa7-4baf-a7d9-50bfd22ca02f', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:43:30.597893+00', '2026-08-03 22:43:30.597893+00'),
	('952ec4c1-d319-4e0c-9d8d-6490122cdfa5', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:44:19.843117+00', '2026-08-03 22:44:19.843117+00'),
	('8655a4a5-f265-42f9-8c8b-e2eb634b6be6', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', NULL, 'quanto foi vendido de tortas esse mes', '2026-08-03 22:51:25.284875+00', '2026-08-03 22:51:25.284875+00');


--
-- Data for Name: datasets; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."datasets" ("id", "organization_id", "name", "google_sheet_id", "schema_metadata", "status", "created_at", "sketch") VALUES
	('3d505b88-7f22-4921-bf6b-f972e58ec0f9', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Dados de Vendas - Demo SaaS AI - Dados de Vendas - Demo SaaS AI.csv', NULL, '{"columns": {"id": {"cleaning_rule": "Manter como tipo inteiro (INT), servindo como chave primária.", "semantic_definition": "Identificador único e sequencial do registro de venda ou transação."}, "data": {"cleaning_rule": "Converter o número de série de data do Excel (float) para o formato padrão de data e hora do banco de dados relacional (DATETIME/TIMESTAMP) no formato ''YYYY-MM-DD HH:MM:SS''.", "semantic_definition": "Data em que a transação foi realizada, representada em formato numérico de ponto flutuante (padrão de número de série de data, comum em planilhas como Excel)."}, "regiao": {"cleaning_rule": "Manter como VARCHAR.", "semantic_definition": "Região geográfica de destino da venda/entrega."}, "status": {"cleaning_rule": "Manter como VARCHAR.", "semantic_definition": "Estado atual do processamento ou entrega do pedido (ex: Entregue, Pendente)."}, "produto": {"cleaning_rule": "Corrigir a codificação de caracteres corrompida para restaurar acentos e caracteres especiais, garantindo o escape correto de aspas duplas internas e definindo como VARCHAR.", "semantic_definition": "Nome comercial ou descrição do item específico vendido."}, "categoria": {"cleaning_rule": "Corrigir a codificação de caracteres corrompida (UTF-8 interpretado incorretamente) para restaurar acentos e caracteres especiais, definindo como VARCHAR.", "semantic_definition": "Classificação ou segmento de mercado ao qual o produto pertence (ex: Eletrônicos, Escritório, Acessórios)."}, "quantidade": {"cleaning_rule": "Manter como tipo inteiro (INT).", "semantic_definition": "Volume ou número de unidades do produto comercializadas na transação."}, "receita_total": {"cleaning_rule": "Converter para tipo numérico decimal (DECIMAL(10,2)) para garantir precisão monetária.", "semantic_definition": "Faturamento bruto gerado pela transação, calculado matematicamente como o produto entre a quantidade e o preço unitário."}, "preco_unitario": {"cleaning_rule": "Converter para tipo numérico decimal (DECIMAL(10,2)) para garantir precisão monetária.", "semantic_definition": "Valor monetário de uma única unidade do produto."}}}', 'ativo', '2026-07-17 01:58:46.990992+00', NULL),
	('5e476dd4-f2df-4253-b0b3-2056abe21a16', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'Base_Sintetica_Risco_Credito_10k.xlsx', NULL, '{"columns": {"regiao": {"cleaning_rule": "Manter como string (VARCHAR), removendo espaços em branco sobressalentes nas extremidades.", "semantic_definition": "Região geográfica do Brasil onde a empresa cliente está localizada ou possui sede."}, "id_cliente": {"cleaning_rule": "Manter como string (VARCHAR), garantindo que esteja em caixa alta e sem espaços em branco nas extremidades.", "semantic_definition": "Identificador único do cliente na base de dados, representado por um código alfanumérico."}, "receita_anual": {"cleaning_rule": "Arredondar para 2 casas decimais para representar valores monetários com precisão, compatível com o tipo DECIMAL(18,2).", "semantic_definition": "Faturamento ou receita bruta anual da empresa cliente, expressa em valor monetário decimal."}, "setor_economico": {"cleaning_rule": "Manter como string (VARCHAR), removendo espaços em branco sobressalentes nas extremidades.", "semantic_definition": "Segmento ou setor da economia no qual a empresa cliente atua (ex: Indústria, Comércio, Serviços, Agronegócio)."}, "flag_inadimplente": {"cleaning_rule": "Manter como número inteiro (0 ou 1), ideal para mapeamento como tipo BOOLEAN ou TINYINT no banco de dados relacional.", "semantic_definition": "Indicador binário de inadimplência, onde o valor 1 indica que o cliente está inadimplente e 0 indica adimplência."}, "divida_sobre_lucro": {"cleaning_rule": "Arredondar para 4 casas decimais para manter a precisão do indicador financeiro, compatível com o tipo DECIMAL(10,4).", "semantic_definition": "Indicador financeiro que representa a relação entre a dívida total da empresa e o seu lucro (métrica de alavancagem financeira)."}, "idade_empresa_anos": {"cleaning_rule": "Manter como número inteiro (INT), representando a idade da empresa em anos.", "semantic_definition": "Tempo de atividade ou existência da empresa cliente, mensurado em anos."}, "score_credito_externo": {"cleaning_rule": "Manter como número inteiro (INT), representando a pontuação de crédito.", "semantic_definition": "Pontuação de crédito do cliente obtida através de bureaus de crédito externos, utilizada para avaliação de risco de inadimplência."}, "meses_relacionamento_banco": {"cleaning_rule": "Manter como número inteiro (INT), representando a quantidade de meses de relacionamento.", "semantic_definition": "Tempo total de relacionamento comercial ativo entre o cliente e a instituição financeira, mensurado em meses."}}}', 'ativo', '2026-07-21 19:38:15.140033+00', NULL),
	('01db6cc7-e7b1-478c-ae93-121fce360d58', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', 'doceria_vendas.csv', NULL, '{"columns": {"sabor": {"cleaning_rule": "Manter como texto, tipo VARCHAR(50), padronizando a primeira letra em maiúscula.", "semantic_definition": "Variante de sabor específica associada ao produto."}, "produto": {"cleaning_rule": "Manter como texto, tipo VARCHAR(100), garantindo a capitalização correta das palavras e remoção de espaços em branco sobressalentes.", "semantic_definition": "Nome ou designação comercial do item ou doce vendido."}, "vendedor": {"cleaning_rule": "Manter como texto, tipo VARCHAR(50), padronizando o nome do vendedor para consistência relacional.", "semantic_definition": "Nome do profissional de vendas responsável pela comercialização do produto."}, "categoria": {"cleaning_rule": "Manter como texto, tipo VARCHAR(50), útil para indexação e agrupamento de produtos.", "semantic_definition": "Classificação ou agrupamento do produto para fins de organização de catálogo (ex: Docinho, Bolo)."}, "vendas_mes": {"cleaning_rule": "Garantir o tipo Inteiro (INT), representando a quantidade absoluta de vendas no período.", "semantic_definition": "Quantidade total de unidades do produto que foram vendidas no período de um mês."}, "preco_unitario": {"cleaning_rule": "Converter para tipo numérico Decimal (DECIMAL(10,2)), garantindo a precisão de duas casas decimais para valores monetários.", "semantic_definition": "Preço de venda de uma única unidade do produto, expresso em valor monetário."}}}', 'active', '2026-08-03 22:16:25.449129+00', NULL),
	('cdcef2a8-d888-487c-9e7f-c9f87baa3158', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', 'demo_riosulense.xlsx', NULL, '{"columns": {"of": {"cleaning_rule": "Manter como número inteiro (identificador da Ordem de Fabricação).", "semantic_definition": "Código identificador único da Ordem de Fabricação (OF), utilizado para rastrear e gerenciar um lote ou ordem de produção específica no processo industrial."}, "familia": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Código alfanumérico ou numérico que identifica a família de produtos à qual o item pertence, agrupando itens com características técnicas ou de manufatura semelhantes."}, "produto": {"cleaning_rule": "Manter como número inteiro (código do produto).", "semantic_definition": "Código identificador único (SKU ou ID) do produto no sistema de manufatura, utilizado para controle de estoque e produção."}, "operacao": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Código numérico ou identificador que representa uma etapa ou operação específica do processo de manufatura (ex: usinagem, pintura, montagem)."}, "custo_total": {"cleaning_rule": "Se for string, substituir vírgula por ponto. Se for inteiro, dividir por 1000 para converter para float.", "semantic_definition": "Valor monetário total acumulado para a execução da operação ou para a conclusão da Ordem de Fabricação (OF), englobando custos de materiais, processos e terceiros."}, "produto_liga": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Código identificador da liga metálica ou da matéria-prima principal que compõe a estrutura e composição química do produto."}, "custo_insumos": {"cleaning_rule": "Remover separadores de milhar, substituir a vírgula decimal por ponto e converter para float.", "semantic_definition": "Custo financeiro total referente aos insumos, materiais secundários e matérias-primas consumidos durante o processo produtivo."}, "custo_produto": {"cleaning_rule": "Dividir por 1000 para converter o valor inteiro para float.", "semantic_definition": "Custo de fabricação unitário ou total atribuído diretamente ao produto acabado, desconsiderando custos indiretos de processo."}, "motivo_refugo": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Código numérico ou identificador que categoriza o motivo específico pelo qual uma peça foi rejeitada ou descartada (refugada) no processo produtivo."}, "custo_processos": {"cleaning_rule": "Se for string, remover pontos e substituir vírgula por ponto. Se for inteiro, dividir por 100.000 para manter 5 casas decimais e converter para float.", "semantic_definition": "Custo financeiro associado estritamente às operações, mão de obra e recursos de manufatura aplicados na produção, excluindo o custo de materiais."}, "seq_operacional": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Número inteiro sequencial que define a ordem cronológica de execução da operação dentro do roteiro de produção (ex: 10, 20, 30)."}, "data_apontamento": {"cleaning_rule": "Converter datas em formato serial do Excel (ex: 46297) ou texto (DD/MM/YYYY) para o formato padrão ISO YYYY-MM-DD.", "semantic_definition": "Data e hora em que a realização da operação ou a produção do lote foi registrada (apontada) oficialmente no sistema de manufatura."}, "valor_subproduto": {"cleaning_rule": "Converter para float.", "semantic_definition": "Valor financeiro estimado ou obtido com a venda ou reaproveitamento de subprodutos ou resíduos gerados durante o processo de fabricação."}, "descricao_familia": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Nome ou descrição textual detalhada que identifica e caracteriza a família de produtos associada ao código da família."}, "descricao_produto": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Nome, modelo, dimensões ou especificações técnicas detalhadas que descrevem o produto de forma clara."}, "descricao_operacao": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Texto descritivo que detalha a atividade, tarefa ou processo executado na respectiva operação de manufatura."}, "peso_nao_conformes": {"cleaning_rule": "Dividir por 1000 para converter o valor inteiro implícito para float com 3 casas decimais (representando kg).", "semantic_definition": "Peso total (geralmente em kg ou toneladas) das peças que foram classificadas como não conformes, rejeitadas ou refugadas no lote."}, "custo_material_liga": {"cleaning_rule": "Dividir por 1000 para converter o valor inteiro para float.", "semantic_definition": "Custo financeiro específico da liga metálica ou matéria-prima principal utilizada na fabricação do produto."}, "custo_nao_conformes": {"cleaning_rule": "Remover separadores de milhar, substituir a vírgula decimal por ponto, converter para float e manter com 5 casas decimais.", "semantic_definition": "Custo financeiro total atribuído às peças rejeitadas ou não conformes, considerando o desperdício de material e o custo do processo já aplicado até o momento do refugo."}, "pecas_nao_conformes": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Quantidade física (em unidades) de peças que apresentaram defeitos ou não conformidades e foram rejeitadas durante o processo."}, "situacao_engenharia": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Status atual de liberação ou revisão do produto/processo pela equipe de engenharia (ex: Aprovado, Em Revisão, Bloqueado)."}, "data_lancamento_liga": {"cleaning_rule": "Converter data em formato serial do Excel para o formato padrão ISO YYYY-MM-DD.", "semantic_definition": "Data em que o lote ou o registro da liga metálica foi lançado e disponibilizado para uso no sistema de produção."}, "quantidade_produzida": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Quantidade total de peças físicas (boas e ruins) que foram produzidas na respectiva Ordem de Fabricação (OF)."}, "classificacao_produto": {"cleaning_rule": "Manter como número inteiro.", "semantic_definition": "Código que define a categoria ou o estágio atual do produto no fluxo de valor (ex: matéria-prima, semiacabado, acabado)."}, "custo_operacao_externa": {"cleaning_rule": "Converter para float.", "semantic_definition": "Custo financeiro decorrente de serviços de manufatura ou processos de beneficiamento contratados de terceiros (externalizados)."}, "descricao_classificacao": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Descrição textual clara da classificação do produto (ex: ''PRODUTO ACABADO'', ''SEMI-ACABADO'', ''MATÉRIA-PRIMA'')."}, "descricao_motivo_refugo": {"cleaning_rule": "Manter como string de texto.", "semantic_definition": "Texto explicativo detalhado que descreve a causa ou o defeito que levou à rejeição/refugo da peça (ex: ''Trinca'', ''Fora de dimensional'')."}, "percent_peso_nao_conformes": {"cleaning_rule": "Dividir por 1000 para converter o valor inteiro para float (porcentagem).", "semantic_definition": "Percentual do peso de peças não conformes em relação ao peso total produzido, representado como um valor inteiro (ex: 15 para indicar 15%)."}, "percent_custo_nao_conformes": {"cleaning_rule": "Dividir por 1000 para converter o valor inteiro para float (porcentagem).", "semantic_definition": "Percentual do custo de peças não conformes em relação ao custo total de produção, representado como um valor inteiro (ex: 8 para indicar 8%)."}}}', 'active', '2026-08-04 18:18:29.170045+00', NULL);


--
-- Data for Name: domain_binding_audit; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."domain_binding_audit" ("id", "user_id", "email_domain", "organization_id", "signal", "result", "created_at") VALUES
	('0adc17f1-6484-4258-9a11-3c7503f2f628', '5122391a-9041-421c-9397-401360277674', 'gmail.com', 'f6bb2278-c010-4938-94eb-15079c6399f8', 'admin_setup', 'org_created', '2026-07-22 23:46:07.534429+00'),
	('92aa7e5e-2334-4379-bef5-827edb680d89', '5ce07b07-f2b0-4688-861f-612bd13a61ca', 'babygoat.com', NULL, 'email_domain', 'no_match', '2026-07-23 14:19:10.419116+00'),
	('fd4144cf-e7cd-4ebf-adc7-975aa179baf9', 'ee31f844-f808-4ddf-8c07-542c9f59a44d', 'gmail.com', NULL, 'email_domain', 'denylisted', '2026-07-23 15:54:09.404108+00'),
	('916131ee-9e19-4b93-b12a-e4ac8f565e30', '89bd8cdd-6eaf-45b3-998b-c9e683831641', 'polijunior.com.br', NULL, 'email_domain', 'no_match', '2026-07-23 16:38:01.693952+00'),
	('067c35c2-d18a-4f2e-928a-04c624cb656f', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'polijunior.com.br', NULL, 'email_domain', 'no_match', '2026-07-23 16:46:40.956351+00'),
	('9669837c-410b-4565-94df-eef34e3cc30d', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', NULL, '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', 'admin_setup', 'org_created', '2026-07-23 17:02:27.417766+00'),
	('36b9b7f5-e2e9-4dee-bd6a-1afad5fca2d8', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'usp.br', NULL, 'email_domain', 'no_match', '2026-07-23 17:56:48.480635+00'),
	('e9d1b14f-30ad-43e1-bbfd-8a5f3daa826c', '6957ea5f-06dc-4312-bafa-6473957a09cf', NULL, 'b457c440-49a0-41ec-949d-83705d67ac37', 'admin_setup', 'org_created', '2026-07-23 18:04:38.202404+00'),
	('1ab23207-8151-4538-bf1c-6f339048a28b', '106ed8fc-e240-4595-914d-37891cab5d43', 'usp.br', NULL, 'email_domain', 'no_match', '2026-07-23 18:28:05.443546+00'),
	('cc9ce023-1f27-4181-9f8d-0f66c90fdd7b', '106ed8fc-e240-4595-914d-37891cab5d43', NULL, '645dddd1-e27f-40e0-9eff-def8bbe9755c', 'admin_setup', 'org_created', '2026-07-23 18:28:06.878825+00'),
	('849d8184-b454-4699-bd46-d203b69ffa8b', '1f71f6ea-8563-4e0a-8c49-4100e6926b5f', 'gmail.com', NULL, 'email_domain', 'denylisted', '2026-07-24 17:39:45.366072+00');


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."messages" ("id", "conversation_id", "organization_id", "profile_id", "canal", "direcao", "content", "meta", "created_at") VALUES
	('e81f51b9-91d4-4899-a19d-3c110928a916', '88f23dc9-df8f-4c1f-8ad1-bd5e02902087', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto eu vendi', NULL, '2026-08-03 22:06:59.200041+00'),
	('514a075c-6f98-400c-a81f-6db8a3c945a5', '2259225c-9021-4543-ade4-763d405389d7', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:21:21.030792+00'),
	('0ca4c260-be1a-4255-9b40-b3e8c8c55c60', 'd0a9f1a7-bee0-4361-a2ff-39815e53bc57', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:36:40.412297+00'),
	('49165a23-aa2d-40c4-827f-b1fb71fe13db', '3b599eae-bf60-4c0f-b909-9f5e620a70a8', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:40:39.301587+00'),
	('8f6e94a2-fff9-4cf2-827e-bad738ca5c1b', '2a2ff22d-ac4a-4df6-a842-b5fdc391954b', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:41:05.940511+00'),
	('a2a30e08-20ea-4c29-a45d-41cffdce8926', 'd7b9a015-bfa7-4baf-a7d9-50bfd22ca02f', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:43:31.052193+00'),
	('75f5e3ee-1c16-426d-9eb2-ced03f19ac97', '952ec4c1-d319-4e0c-9d8d-6490122cdfa5', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:44:20.021347+00'),
	('d1ba8811-0804-46c6-a487-2745009b608f', '8655a4a5-f265-42f9-8c8b-e2eb634b6be6', 'f2f52856-7315-4913-8b19-d5e1b7e248c6', '1c0f6d4e-1a98-4804-b694-4d3f2bb5eca5', 'web', 'in', 'quanto foi vendido de tortas esse mes', NULL, '2026-08-03 22:51:25.465038+00');


--
-- Data for Name: organization_domains; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profile_changes_audit; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profile_changes_audit" ("id", "profile_id", "organization_id", "changed_by", "field", "old_value", "new_value", "changed_at") VALUES
	('a8af59c3-d880-46fe-a37f-0e98d86f6872', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'status', 'pendente', 'ativo', '2026-07-23 17:02:27.417766+00'),
	('55a7b234-b1dc-4b85-ba4a-ac22472273c6', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'role_id', NULL, '3f88690e-4ecd-4fc0-a5ea-f85a4182f1be', '2026-07-23 17:02:27.417766+00'),
	('cb3a6d8e-e891-49ec-9a43-a950b1a92006', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', '44ddb5df-f54c-4adc-b196-4c9421c1b6c9', 'organization_id', NULL, '3bf8596f-7a4d-4b91-8fd5-bdb78a512251', '2026-07-23 17:02:27.417766+00'),
	('79c9bd19-7dc9-4b9e-867d-678c10030990', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'b457c440-49a0-41ec-949d-83705d67ac37', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'status', 'pendente', 'ativo', '2026-07-23 18:04:38.202404+00'),
	('b1a46c4e-72e5-436d-8056-f1e3bd578940', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'b457c440-49a0-41ec-949d-83705d67ac37', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'role_id', NULL, 'bfa21842-3bd1-45a8-a23f-cb46bd3545aa', '2026-07-23 18:04:38.202404+00'),
	('43973a84-08fb-46e6-bbb9-d32500c0f080', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'b457c440-49a0-41ec-949d-83705d67ac37', '6957ea5f-06dc-4312-bafa-6473957a09cf', 'organization_id', NULL, 'b457c440-49a0-41ec-949d-83705d67ac37', '2026-07-23 18:04:38.202404+00'),
	('7f309abd-84a8-4772-8b97-7de3964789d1', '106ed8fc-e240-4595-914d-37891cab5d43', '645dddd1-e27f-40e0-9eff-def8bbe9755c', '106ed8fc-e240-4595-914d-37891cab5d43', 'status', 'pendente', 'ativo', '2026-07-23 18:28:06.878825+00'),
	('fa2676cd-e9ea-49a8-a274-2edfceaa3c38', '106ed8fc-e240-4595-914d-37891cab5d43', '645dddd1-e27f-40e0-9eff-def8bbe9755c', '106ed8fc-e240-4595-914d-37891cab5d43', 'role_id', NULL, '720226db-a448-4a97-b430-35adbf40aae7', '2026-07-23 18:28:06.878825+00'),
	('531b979a-ef5f-42df-883b-c3ed21a53043', '106ed8fc-e240-4595-914d-37891cab5d43', '645dddd1-e27f-40e0-9eff-def8bbe9755c', '106ed8fc-e240-4595-914d-37891cab5d43', 'organization_id', NULL, '645dddd1-e27f-40e0-9eff-def8bbe9755c', '2026-07-23 18:28:06.878825+00');


--
-- Data for Name: public_email_domains; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."public_email_domains" ("domain") VALUES
	('gmail.com'),
	('googlemail.com'),
	('outlook.com'),
	('hotmail.com'),
	('live.com'),
	('yahoo.com'),
	('yahoo.com.br'),
	('icloud.com'),
	('me.com'),
	('aol.com'),
	('proton.me'),
	('protonmail.com'),
	('bol.com.br'),
	('uol.com.br'),
	('terra.com.br');


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."role_permissions" ("id", "organization_id", "role_id", "dataset_id", "allowed_columns", "created_by", "updated_at") VALUES
	('4fe96487-eeb2-478f-99c7-669731e8be84', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', '5a8f08fa-8ded-4e1f-b1d8-3aa1236f1964', '3d505b88-7f22-4921-bf6b-f972e58ec0f9', '{id,receita_total,preco_unitario,quantidade,data}', '702fb64c-e4fe-4481-a409-2a943be31a99', '2026-07-17 02:01:19.223345+00'),
	('445fb0b8-54e3-4362-b086-a40d70f7fa40', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', 'a00f2bd6-6068-4287-b01a-534e4c49be7a', '3d505b88-7f22-4921-bf6b-f972e58ec0f9', '{id,data}', '702fb64c-e4fe-4481-a409-2a943be31a99', '2026-07-18 14:51:14.129126+00'),
	('9d79bf8f-f493-4cf5-bbf5-b4a8fececd8f', 'c1d0b30e-3fa2-4c7d-9b8f-51faad56f5d5', '628bb2d3-3de8-411f-9fa3-c4c0a573270f', '3d505b88-7f22-4921-bf6b-f972e58ec0f9', '{id,data,quantidade}', '702fb64c-e4fe-4481-a409-2a943be31a99', '2026-07-22 20:13:20.402672+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 89, true);


--
-- Name: Leads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."Leads_id_seq"', 18, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict SzKKe9oJ1a1qJaDSc0ST3NInEbDLC3v9OFfFPhNcrd66oDguWZruuNkzdrcUIOc

RESET ALL;
