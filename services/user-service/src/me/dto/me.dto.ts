import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsNewPassword } from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Số điện thoại Việt Nam: 0 + 9 số */
export const PHONE_PATTERN = /^0\d{9}$/;
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

/** Sửa hồ sơ (ACC-04). Chỉ gửi trường muốn đổi; gửi null để xóa SĐT, ngày sinh, giới tính. */
export class UpdateProfileDto {
  @Transform(trim)
  @ValidateIf((_o, v) => v !== undefined)
  @IsString({ message: 'Vui lòng nhập họ tên.' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên.' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự.' })
  fullName?: string;

  /** 0 + 9 số */
  @ApiPropertyOptional({ nullable: true, example: '0912345678' })
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @Matches(PHONE_PATTERN, { message: 'Số điện thoại gồm số 0 và 9 chữ số.' })
  phone?: string | null;

  /** Ngày sinh dạng YYYY-MM-DD */
  @ApiPropertyOptional({ nullable: true, example: '2003-05-20' })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsDateString({ strict: true }, { message: 'Ngày sinh không hợp lệ.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày sinh dạng YYYY-MM-DD.' })
  birthday?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: GENDERS })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsIn(GENDERS, { message: 'Giới tính không hợp lệ.' })
  gender?: (typeof GENDERS)[number] | null;
}

export class ChangePasswordDto {
  /** Mật khẩu hiện tại. Tài khoản chỉ đăng nhập bằng Google (chưa có mật khẩu) thì bỏ trống */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  /** Từ 8 đến 72 ký tự */
  @IsNewPassword()
  newPassword!: string;
}
