ALTER TABLE "absences" ADD CONSTRAINT "absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "accidents" VALIDATE CONSTRAINT "accidents_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "accidents" VALIDATE CONSTRAINT "accidents_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "accidents" VALIDATE CONSTRAINT "accidents_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "admin_org_provisions" VALIDATE CONSTRAINT "admin_org_provisions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "admin_org_provisions" VALIDATE CONSTRAINT "admin_org_provisions_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "admin_org_provisions" VALIDATE CONSTRAINT "admin_org_provisions_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "billing_profiles" VALIDATE CONSTRAINT "billing_profiles_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "billing_profiles" VALIDATE CONSTRAINT "billing_profiles_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "billing_profiles" VALIDATE CONSTRAINT "billing_profiles_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "branches" VALIDATE CONSTRAINT "branches_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "branches" VALIDATE CONSTRAINT "branches_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "branches" VALIDATE CONSTRAINT "branches_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cost_centers" VALIDATE CONSTRAINT "cost_centers_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cost_centers" VALIDATE CONSTRAINT "cost_centers_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cost_centers" VALIDATE CONSTRAINT "cost_centers_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cpf_analyses" VALIDATE CONSTRAINT "cpf_analyses_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cpf_analyses" VALIDATE CONSTRAINT "cpf_analyses_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "cpf_analyses" VALIDATE CONSTRAINT "cpf_analyses_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_classifications" VALIDATE CONSTRAINT "job_classifications_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_classifications" VALIDATE CONSTRAINT "job_classifications_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_classifications" VALIDATE CONSTRAINT "job_classifications_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_positions" VALIDATE CONSTRAINT "job_positions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_positions" VALIDATE CONSTRAINT "job_positions_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "job_positions" VALIDATE CONSTRAINT "job_positions_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "labor_lawsuits" VALIDATE CONSTRAINT "labor_lawsuits_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "labor_lawsuits" VALIDATE CONSTRAINT "labor_lawsuits_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "labor_lawsuits" VALIDATE CONSTRAINT "labor_lawsuits_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "medical_certificates" VALIDATE CONSTRAINT "medical_certificates_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "medical_certificates" VALIDATE CONSTRAINT "medical_certificates_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "medical_certificates" VALIDATE CONSTRAINT "medical_certificates_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "organization_profiles" VALIDATE CONSTRAINT "organization_profiles_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "organization_profiles" VALIDATE CONSTRAINT "organization_profiles_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "organization_profiles" VALIDATE CONSTRAINT "organization_profiles_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "features" VALIDATE CONSTRAINT "features_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "features" VALIDATE CONSTRAINT "features_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_deliveries" VALIDATE CONSTRAINT "ppe_deliveries_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_deliveries" VALIDATE CONSTRAINT "ppe_deliveries_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_deliveries" VALIDATE CONSTRAINT "ppe_deliveries_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" VALIDATE CONSTRAINT "ppe_delivery_items_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" VALIDATE CONSTRAINT "ppe_delivery_items_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" VALIDATE CONSTRAINT "ppe_delivery_logs_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_items" VALIDATE CONSTRAINT "ppe_items_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_items" VALIDATE CONSTRAINT "ppe_items_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_items" VALIDATE CONSTRAINT "ppe_items_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_job_positions" VALIDATE CONSTRAINT "ppe_job_positions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "ppe_job_positions" VALIDATE CONSTRAINT "ppe_job_positions_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_employees" VALIDATE CONSTRAINT "project_employees_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_employees" VALIDATE CONSTRAINT "project_employees_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "sectors" VALIDATE CONSTRAINT "sectors_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "sectors" VALIDATE CONSTRAINT "sectors_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "sectors" VALIDATE CONSTRAINT "sectors_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "terminations" VALIDATE CONSTRAINT "terminations_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "terminations" VALIDATE CONSTRAINT "terminations_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "terminations" VALIDATE CONSTRAINT "terminations_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "vacations" VALIDATE CONSTRAINT "vacations_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "vacations" VALIDATE CONSTRAINT "vacations_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "vacations" VALIDATE CONSTRAINT "vacations_deleted_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "warnings" VALIDATE CONSTRAINT "warnings_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "warnings" VALIDATE CONSTRAINT "warnings_updated_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "warnings" VALIDATE CONSTRAINT "warnings_deleted_by_users_id_fk";
