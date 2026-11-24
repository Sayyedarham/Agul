UPDATE auth.users
SET encrypted_password = crypt('NewTemporaryPassword123!', gen_salt('bf'))
WHERE id = '054a4de6-19b0-4a9f-9b68-dfdcd02d01e5';