import { Activity } from '../entities/activity.entity.js'; // Ensure Activity is decorated
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto.js';

// Create the specific DTO by passing the Activity class to the factory
export class PaginatedActivityResponseDto extends PaginatedResponseDto(Activity) {}