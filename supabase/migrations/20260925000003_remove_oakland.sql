-- Not serving North Oakland & Emeryville yet: hide the service area.
update public.service_areas set active = false where slug = 'oakland-emeryville';
