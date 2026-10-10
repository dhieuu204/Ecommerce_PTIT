import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Đình chỉ hoặc khôi phục shop */
export class ModerationDto {
  /** Lý do (seller sẽ đọc khi bị đình chỉ), 5–500 ký tự */
  @Transform(trim)
  // Thứ tự: câu báo lỗi của decorator viết dưới cùng được trả trước
  @Length(5, 500, { message: 'Lý do dài từ 5 đến 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  reason!: string;
}
