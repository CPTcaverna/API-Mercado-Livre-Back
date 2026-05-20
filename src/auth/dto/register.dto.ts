import { IsEmail, IsString, IsStrongPassword, MinLength } from 'class-validator';

const STRONG_PASSWORD_MESSAGE =
  'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula, número e caractere especial.';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres.' })
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    { message: STRONG_PASSWORD_MESSAGE },
  )
  password: string;
}
