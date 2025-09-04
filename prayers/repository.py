import os
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import List, Optional

from django.conf import settings

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:  # pragma: no cover
    boto3 = None  # type: ignore
    BotoCoreError = ClientError = Exception  # type: ignore

from .models import Prayer as PrayerModel


@dataclass
class PrayerDTO:
    id: str
    text: str
    created_at: datetime
    updated_at: datetime
    clicked_as_prayed_over_count: int
    has_been_changed: bool
    status: str
    is_ai_generated: bool
    ai_generation_references: Optional[str]

    @property
    def age_in_days(self) -> int:
        return (datetime.now(timezone.utc) - self.created_at).days


class BaseRepository:
    def list_prayers(self) -> List[PrayerDTO]:
        raise NotImplementedError

    def get_prayer(self, prayer_id: str) -> Optional[PrayerDTO]:
        raise NotImplementedError

    def create_prayer(
        self,
        text: str,
        status: str = "new",
        is_ai_generated: bool = False,
        ai_generation_references: Optional[str] = None,
    ) -> PrayerDTO:
        raise NotImplementedError

    def delete_prayer(self, prayer_id: str) -> None:
        raise NotImplementedError

    def increment_prayed_over(self, prayer_id: str) -> None:
        raise NotImplementedError

    def update_status(self, prayer_id: str, status: str) -> None:
        raise NotImplementedError


class ORMRepository(BaseRepository):
    def _to_dto(self, obj: PrayerModel) -> PrayerDTO:
        return PrayerDTO(
            id=str(obj.id),
            text=obj.text,
            created_at=obj.created_at,
            updated_at=obj.updated_at,
            clicked_as_prayed_over_count=obj.clicked_as_prayed_over_count,
            has_been_changed=obj.has_been_changed,
            status=obj.status,
            is_ai_generated=obj.is_ai_generated,
            ai_generation_references=obj.ai_generation_references,
        )

    def list_prayers(self) -> List[PrayerDTO]:
        return [self._to_dto(p) for p in PrayerModel.objects.all().order_by('-created_at')]

    def get_prayer(self, prayer_id: str) -> Optional[PrayerDTO]:
        try:
            obj = PrayerModel.objects.get(id=prayer_id)
            return self._to_dto(obj)
        except PrayerModel.DoesNotExist:
            return None

    def create_prayer(
        self,
        text: str,
        status: str = "new",
        is_ai_generated: bool = False,
        ai_generation_references: Optional[str] = None,
    ) -> PrayerDTO:
        obj = PrayerModel.objects.create(
            text=text,
            status=status,
            is_ai_generated=is_ai_generated,
            ai_generation_references=ai_generation_references,
        )
        return self._to_dto(obj)

    def delete_prayer(self, prayer_id: str) -> None:
        try:
            PrayerModel.objects.get(id=prayer_id).delete()
        except PrayerModel.DoesNotExist:
            pass

    def increment_prayed_over(self, prayer_id: str) -> None:
        try:
            obj = PrayerModel.objects.get(id=prayer_id)
            obj.clicked_as_prayed_over_count += 1
            obj.save(update_fields=['clicked_as_prayed_over_count'])
        except PrayerModel.DoesNotExist:
            pass

    def update_status(self, prayer_id: str, status: str) -> None:
        try:
            obj = PrayerModel.objects.get(id=prayer_id)
            obj.status = status
            obj.save(update_fields=['status'])
        except PrayerModel.DoesNotExist:
            pass


class DynamoDBRepository(BaseRepository):
    def __init__(self, table_name: str, region_name: Optional[str] = None):
        if boto3 is None:
            raise RuntimeError("boto3 is required for DynamoDBRepository")
        self._resource = boto3.resource('dynamodb', region_name=region_name)
        self._table = self._resource.Table(table_name)

    @staticmethod
    def _from_item(item: dict) -> PrayerDTO:
        created_at = datetime.fromisoformat(item['created_at'])
        updated_at = datetime.fromisoformat(item['updated_at'])
        return PrayerDTO(
            id=item['id'],
            text=item['text'],
            created_at=created_at,
            updated_at=updated_at,
            clicked_as_prayed_over_count=int(item.get('clicked_as_prayed_over_count', 0)),
            has_been_changed=bool(item.get('has_been_changed', False)),
            status=item.get('status', 'new'),
            is_ai_generated=bool(item.get('is_ai_generated', False)),
            ai_generation_references=item.get('ai_generation_references'),
        )

    def list_prayers(self) -> List[PrayerDTO]:
        resp = self._table.scan()
        items = resp.get('Items', [])
        dtos = [self._from_item(i) for i in items]
        return sorted(dtos, key=lambda d: d.created_at, reverse=True)

    def get_prayer(self, prayer_id: str) -> Optional[PrayerDTO]:
        resp = self._table.get_item(Key={'id': prayer_id})
        item = resp.get('Item')
        return self._from_item(item) if item else None

    def create_prayer(
        self,
        text: str,
        status: str = "new",
        is_ai_generated: bool = False,
        ai_generation_references: Optional[str] = None,
    ) -> PrayerDTO:
        now = datetime.now(timezone.utc).isoformat()
        prayer_id = str(uuid.uuid4())
        item = {
            'id': prayer_id,
            'text': text,
            'created_at': now,
            'updated_at': now,
            'clicked_as_prayed_over_count': 0,
            'has_been_changed': False,
            'status': status,
            'is_ai_generated': is_ai_generated,
            'ai_generation_references': ai_generation_references or '',
        }
        self._table.put_item(Item=item)
        return self._from_item(item)

    def delete_prayer(self, prayer_id: str) -> None:
        self._table.delete_item(Key={'id': prayer_id})

    def increment_prayed_over(self, prayer_id: str) -> None:
        self._table.update_item(
            Key={'id': prayer_id},
            UpdateExpression='SET clicked_as_prayed_over_count = if_not_exists(clicked_as_prayed_over_count, :zero) + :one, updated_at = :now',
            ExpressionAttributeValues={
                ':one': 1,
                ':zero': 0,
                ':now': datetime.now(timezone.utc).isoformat(),
            }
        )

    def update_status(self, prayer_id: str, status: str) -> None:
        self._table.update_item(
            Key={'id': prayer_id},
            UpdateExpression='SET #s = :s, updated_at = :now',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={
                ':s': status,
                ':now': datetime.now(timezone.utc).isoformat(),
            }
        )


def get_repository() -> BaseRepository:
    use_ddb = os.getenv('USE_DYNAMODB', 'false').lower() == 'true'
    if use_ddb:
        table = os.getenv('DDB_TABLE_NAME', 'prayer-app-prayers')
        region = os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION')
        return DynamoDBRepository(table_name=table, region_name=region)
    return ORMRepository()


