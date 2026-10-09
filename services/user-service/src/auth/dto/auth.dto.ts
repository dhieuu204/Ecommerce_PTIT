import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Quy tắc mật khẩu đã chốt: từ 8 ký tự, không bắt buộc chữ hoa/số/ký tự đặc biệt; tối đa 72 (giới hạn bcrypt). */
export function IsNewPassword(): PropertyDecorator {
  return (target, key) => {
    IsString({ message: 'Mật khẩu không hợp lệ.' })(target, key);
    MinLength(8, { message: 'Mật khẩu cần ít nhất 8 ký tự.' })(target, key);
    MaxLength(72, { message: 'Mật khẩu tối đa 72 ký tự.' })(target, key);
  };
}

export class EmailDto {
  /** Email đăng nhập */
  @Transform(lower)
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(254, { message: 'Email quá dài.' })
  email!: string;
}

export class RegisterDto extends EmailDto {
  /** Họ tên hiển thị */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên.' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự.' })
  fullName!: string;

  /** Từ 8 đến 72 ký tự */
  @IsNewPassword()
  password!: string;
}

export class VerifyCodeDto extends EmailDto {
  /** Mã 6 số trong email */
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'Mã gồm 6 chữ số.' })
  code!: string;
}

export class LoginDto extends EmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu.' })
  @MaxLength(200)
  password!: string;
}

export class ResetPasswordDto extends VerifyCodeDto {
  /** Mật khẩu mới, từ 8 đến 72 ký tự */
  @IsNewPassword()
  newPassword!: string;
}
