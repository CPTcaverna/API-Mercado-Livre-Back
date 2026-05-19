import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MercadoLivreOAuthService } from './mercadolivre-oauth.service';
import { MercadoLivreTokenService } from './mercadolivre-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MercadoLivreOAuthService,
    MercadoLivreTokenService,
    JwtStrategy,
  ],
  exports: [MercadoLivreTokenService],
})
export class AuthModule {}
