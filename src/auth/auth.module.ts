import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MercadoLibreOAuthService } from './mercadolibre-oauth.service';
import { MercadoLibreTokenService } from './mercadolibre-token.service';

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
    MercadoLibreOAuthService,
    MercadoLibreTokenService,
    JwtStrategy,
  ],
  exports: [MercadoLibreTokenService],
})
export class AuthModule {}
